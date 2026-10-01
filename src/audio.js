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
  }

  // quiet cabin atmosphere (0..1)
  setHum(v) {
    this.humTarget = v;
    if (this.ctx) this.humGain.gain.setTargetAtTime(clamp(v, 0, 1) * CONFIG.audio.hum, this.ctx.currentTime, 1.2);
  }
  // the end of the session: a soft open fifth, slow in, long out
  endTone() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (const [f, g] of [[293.66, 0.16], [440.0, 0.1], [587.3, 0.04]]) {
      for (const det of [-2.5, 2.5]) {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det;
        const e = this.ctx.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(g * CONFIG.audio.tone, t + 1.6);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
        o.connect(e).connect(this.master); o.start(t); o.stop(t + 7.6);
      }
    }
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
