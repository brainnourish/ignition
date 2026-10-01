import { CONFIG } from './config.js';
import { clamp } from './util.js';

// Fully synthesized: brown-noise rumble and roar, crackle bursts, a bass thump. No files.
export class Sound {
  constructor() {
    // on by default; a viewer who turns it off stays off next time
    let pref = null;
    try { pref = window.localStorage.getItem('ignition.sound'); } catch (e) { /* ignore */ }
    this.enabled = pref !== 'off';
    this.ctx = null;
    this.crackleAcc = 0;
  }

  // browsers only allow audio after a gesture: the first press, click or key starts it
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) this._init();
    this.ctx.resume();
    this.master.gain.setTargetAtTime(CONFIG.audio.master, this.ctx.currentTime, 0.1);
  }

  toggle() {
    this.enabled = !this.enabled;
    try { window.localStorage.setItem('ignition.sound', this.enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (this.enabled && !this.ctx) this._init();
    if (this.ctx) {
      if (this.enabled) this.ctx.resume();
      this.master.gain.setTargetAtTime(this.enabled ? CONFIG.audio.master : 0, this.ctx.currentTime, 0.1);
    }
    return this.enabled;
  }

  _brownBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b = (b + 0.02 * w) / 1.02;
      d[i] = b * 3.5;
    }
    return buf;
  }

  _init() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.output = comp;   // the final mix (tools tap it to record clips)
    const brown = this._brownBuffer(6);

    const loop = () => { const s = ctx.createBufferSource(); s.buffer = brown; s.loop = true; s.start(); return s; };

    // sub rumble
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 48; rf.Q.value = 0.9;
    loop().connect(rf).connect(this.rumbleGain).connect(this.master);

    // roar: low-passed brown noise, cutoff falls with distance
    this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0;
    this.roarFilter = ctx.createBiquadFilter(); this.roarFilter.type = 'lowpass'; this.roarFilter.frequency.value = 900; this.roarFilter.Q.value = 0.5;
    const roarBody = ctx.createBiquadFilter(); roarBody.type = 'peaking'; roarBody.frequency.value = 110; roarBody.gain.value = 3;
    loop().connect(roarBody).connect(this.roarFilter).connect(this.roarGain).connect(this.master);

    // crackle path: white noise bursts through a highpass
    this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    hp.connect(this.crackleGain).connect(this.master);
    this.crackleIn = hp;
    const white = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / wd.length, 2);
    this.whiteBurst = white;

    // cabin hum: fans moving air (band-passed noise) and a faint electrical drone, slowly breathing
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.frequency.value = 260; air.Q.value = 0.7;
    const airGain = ctx.createGain(); airGain.gain.value = 0.55;
    loop().connect(air).connect(airGain).connect(this.humGain);
    for (const [f, g] of [[57.5, 0.05], [115.2, 0.028], [172.6, 0.012]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(this.humGain); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain).connect(this.humGain.gain); lfo.start();
    this.humGain.connect(this.master);
    this.setHum(this.humTarget || 0);
    this._initMusic();
  }

  // ---------- the score: a pipe organ in a large space, heard only at sunrise and sunset
  _initMusic() {
    const ctx = this.ctx;
    // organ stops as one periodic wave: 16' (sub), 8' (unison), 4', 2 2/3', 2', 1 3/5' (very little of the top)
    const n = 12, real = new Float32Array(n), imag = new Float32Array(n);
    const stops = { 1: 1.0, 2: 0.55, 3: 0.22, 4: 0.3, 6: 0.08, 8: 0.1, 10: 0.03 };
    for (const [h, a] of Object.entries(stops)) imag[Number(h)] = a;
    this.organWave = ctx.createPeriodicWave(real, imag);
    // the pads use an airy, flute-like voice: almost all fundamental, a breath of octave
    const fr = new Float32Array(6), fi = new Float32Array(6);
    fi[1] = 1.0; fi[2] = 0.12; fi[3] = 0.03;
    this.airWave = ctx.createPeriodicWave(fr, fi);
    this.padIndex = Math.floor(Math.random() * 4);
    // a long, dark hall: generated impulse response (decaying stereo noise, highs fade first)
    const sr = ctx.sampleRate, len = Math.floor(sr * CONFIG.audio.hall);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const k = 0.08 + 0.6 * Math.exp(-t / 1.4);   // the tail darkens as it decays
        lp += ((Math.random() * 2 - 1) - lp) * k;
        d[i] = lp * Math.exp(-t / (CONFIG.audio.hall * 0.28));
      }
    }
    this.hall = ctx.createConvolver(); this.hall.buffer = ir;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = CONFIG.audio.music;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600; tone.Q.value = 0.4;
    const dry = ctx.createGain(); dry.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.85;
    this.organIn = tone;
    tone.connect(dry).connect(this.musicBus);
    tone.connect(this.hall).connect(wet).connect(this.musicBus);
    this.musicBus.connect(this.master);
    this.voices = new Set();
  }

  // one organ pipe: slow swell, hold, long release (seconds from now); two ranks a few cents apart
  _pipe(midi, start, attack, hold, release, gain, wave = this.organWave, spread = [-3, 3.5]) {
    const ctx = this.ctx, t0 = ctx.currentTime + start;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.setValueAtTime(gain, t0 + attack + hold);
    env.gain.linearRampToValueAtTime(0, t0 + attack + hold + release);
    env.connect(this.organIn);
    const end = t0 + attack + hold + release + 0.1;
    for (const det of spread) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave); o.frequency.value = f; o.detune.value = det;
      o.connect(env); o.start(t0); o.stop(end);
      this.voices.add(o); o.onended = () => this.voices.delete(o);
    }
  }

  // sunrise: a warm C major (add9) rises with the sun; a high E enters as the light reaches the cabin
  sunriseSwell(sessionSeconds) {
    if (!this.ctx || !this.enabled) return;
    // short sessions: the whole gesture fits well inside them
    const span = Math.min(60, Math.max(22, sessionSeconds * 0.45));
    const attack = Math.min(9, span * 0.3), release = span * 0.45, hold = span - attack - release;
    const g = 0.055;
    for (const [m, a] of [[36, 1.0], [43, 0.7], [48, 0.8], [52, 0.6], [55, 0.55], [62, 0.4]]) this._pipe(m, 0, attack, hold, release, g * a);
    this._pipe(76, attack * 0.75, attack * 0.8, Math.max(1, hold - attack * 0.4), release, g * 0.32);
  }

  // sunset: a quieter A minor (add9), timed to fade out exactly at the timer's zero
  sunsetChord(secondsToZero) {
    if (!this.ctx || !this.enabled) return;
    const total = Math.max(4, secondsToZero);
    const attack = Math.min(10, total * 0.35), release = Math.min(14, total * 0.4), hold = Math.max(0, total - attack - release);
    const g = 0.042;
    for (const [m, a] of [[33, 0.9], [40, 0.65], [45, 0.75], [48, 0.6], [52, 0.5], [59, 0.35]]) this._pipe(m, 0, attack, hold, release, g * a);
  }

  // the middle of a long session: a soft, airy major chord high above the hum, swelling and
  // fading over half a minute, with a faint octave shimmer on top. The chords rotate through
  // bright, open colours (major 9, lydian, sus2, major 7) so it never turns dark.
  pad() {
    if (!this.ctx || !this.enabled) return;
    const chords = [
      [60, 64, 67, 71, 74],   // C major 9
      [65, 69, 72, 76, 83],   // F lydian (the raised fourth floats)
      [67, 69, 74, 79, 81],   // G sus2
      [68, 72, 75, 79, 84],   // A-flat major 7 (a warm lift)
    ];
    const ch = chords[this.padIndex % chords.length];
    this.padIndex += 1 + Math.floor(Math.random() * 2);
    const attack = 10, hold = 7, release = 15;
    ch.forEach((m, i) => this._pipe(m, i * 0.6, attack, hold, release, 0.011 * (1 - i * 0.1), this.airWave, [-6, 0, 6]));
    // shimmer: the top note an octave up, entering late, barely there
    this._pipe(ch[ch.length - 1] + 12, attack * 0.8, attack, hold * 0.6, release, 0.0035, this.airWave, [-8, 8]);
  }

  // leaving orbit: let whatever is sounding die away quickly
  stopMusic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(() => { for (const o of this.voices) { try { o.stop(); } catch (e) { /* already stopped */ } } this.voices.clear(); this.musicBus.gain.setTargetAtTime(CONFIG.audio.music, this.ctx.currentTime, 0.05); }, 2500);
  }

  // quiet cabin atmosphere (0..1)
  setHum(v) {
    this.humTarget = v;
    if (this.ctx) this.humGain.gain.setTargetAtTime(clamp(v, 0, 1) * CONFIG.audio.hum, this.ctx.currentTime, 1.2);
  }
  // the end of the session: a soft open fifth, slow in, long out
  // the end: a single soft high pipe (E), ringing out in the hall
  endTone() {
    if (!this.ctx || !this.enabled) return;
    this._pipe(64, 0, 2.2, 1.5, 7, 0.05 * CONFIG.audio.tone);
    this._pipe(76, 0.6, 2.5, 1.0, 8, 0.016 * CONFIG.audio.tone);
  }
  // launch levels are kept low and warm: a deep, soft roar, nothing bright or buzzy (see CONFIG.audio)
  setRumble(v) { if (this.ctx) this.rumbleGain.gain.setTargetAtTime(clamp(v, 0, 1) * CONFIG.audio.rumble, this.ctx.currentTime, 0.3); }
  setRoar(v, cutoff) {
    if (!this.ctx) return;
    this.roarGain.gain.setTargetAtTime(clamp(v, 0, 1) * CONFIG.audio.roar, this.ctx.currentTime, 0.4);
    this.roarFilter.frequency.setTargetAtTime(clamp(cutoff, 60, CONFIG.audio.roarMaxCutoff), this.ctx.currentTime, 0.5);
  }
  crackle(rate, dt, level = 1) {
    if (!this.ctx || !this.enabled || CONFIG.audio.crackle <= 0) return;
    level *= CONFIG.audio.crackle;
    this.crackleGain.gain.setTargetAtTime(0.35 * level, this.ctx.currentTime, 0.05);
    this.crackleAcc += rate * dt;
    while (this.crackleAcc > 1) {
      this.crackleAcc -= 1;
      const s = this.ctx.createBufferSource(); s.buffer = this.whiteBurst;
      s.playbackRate.value = 0.6 + Math.random() * 1.6;
      const g = this.ctx.createGain(); g.gain.value = 0.2 + Math.random() * 0.8;
      s.connect(g).connect(this.crackleIn);
      s.start();
    }
  }
  thump(strength = 1) {
    if (!this.ctx || !this.enabled) return;
    strength *= CONFIG.audio.thump;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(58, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2 * strength, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 1.7);
    // a mid "crack" layer for the ignition
    const s = this.ctx.createBufferSource(); s.buffer = this.whiteBurst; s.playbackRate.value = 0.35;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.3 * strength;
    s.connect(lp).connect(g2).connect(this.master); s.start(t);
  }
}
