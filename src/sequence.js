import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerp, sstep, rand, randSign, expDecay, wobble } from './util.js';
import { Plume } from './plume.js';
import { Orbit } from './orbit/orbit.js';
import { now } from './session.js';
import { loadMinutes, formatClock } from './ui.js';
import { tap, sessionBegin, sessionMoved, sessionFinish, appHidden, appVisible, askForReminders } from './native.js';

const C = CONFIG;
const OB = C.orbit;
const H = C.hold, LF = C.liftoff, PL = C.plume, LI = C.light, SM = C.smoke, CO = C.colors;

// Hold → abort | flight → ended. Drives every system from one place.
export class Sequence {
  constructor({ scene, S, camera, rig, smoke, sparks, post, sound, ui, renderer, wet }) {
    Object.assign(this, { scene, S, camera, rig, smoke, sparks, post, sound, ui, renderer, wet });
    this.state = 'idle';
    this.holdT = 0;
    this.abortT = 0;
    this.flightT = 0;
    this.time = 0;
    this.pressed = false;
    this.power = [0, 0, 0, 0];
    this.bellGlow = 0;
    this.flash = 0;
    this.alt = 0;
    this.rocketPos = new THREE.Vector3();
    this.enginePos = new THREE.Vector3(0, 1.5, 0);
    this.trenchGlow = 0;
    this.acc = { vapor: 0, hold: 0, erupt: 0, splash: 0, trail: 0, sparks: 0 };
    this.separated = false;
    this.sepInfo = null;
    this.ended = false;
    this.blink = 0;
    this.launchScene = scene;
    this.orbit = new Orbit(camera, renderer);
    this.focusMinutes = loadMinutes(OB.defaultMinutes, OB.lengths);
    this.fading = false;
    this.ui.onLength = (m) => { this.focusMinutes = m; };
    this.ui.buildLengths(OB.lengths, this.focusMinutes);
    this.ui.onConfirm = () => this.endEarly();
    this.ui.onEnd = () => this.requestEnd();
    this.leaves = 0;

    this.enginePlumes = [0, 1, 2, 3].map((i) => new Plume(scene, i * 0.37 + 0.1));
    this.mainPlume = new Plume(scene, 0.77);
    this.splash = [new Plume(scene, 0.21), new Plume(scene, 0.58)];

    // static high cloud deck, lit from below when the engines fire
    for (let i = 0; i < SM.cloudCount; i++) {
      smoke.spawn({
        bulk: true,
        x: rand(-700, 700), y: rand(150, 280), z: rand(-300, -900),
        size: rand(260, 460), grow: 0, life: 1e9, alpha: rand(0.025, 0.055),
        base: CO.cloud, lightR: SM.cloudLightRadius, cell: 4 + Math.floor(rand(0, 4)), drag: 1, rotv: rand(-0.01, 0.01), shade: 0.6,
      });
    }
    this._v = new THREE.Vector3();
    this.ui.idle();
  }

  // ------------------------------------------------------------------ input
  press() {
    if (this.pressed) return;
    this.pressed = true;
    if (this.state === 'idle' || this.state === 'ended' || this.state === 'abort') {
      if (this.state !== 'idle') this.resetPad();
      this.state = 'hold';
      this.holdT = 0;
      this.readyTapped = false;
    }
  }

  release() {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.state === 'hold') {
      if (this.holdT >= H.duration) this.ignite();
      else this.abort();
    }
  }

  resetPad() {
    if (this.inOrbit) {
      sessionFinish();
      this.orbit.exit();
      this.sound.setHum(0);
      this.sound.stopMusic();
      this.post.setLayers([[this.launchScene, this.camera]]);
      this.post.setMetering(C.autoExposure.launch);
      this.post.setToneMapping('ACES_FILMIC');
      if (window.__ign && window.__ign.resetQuality) window.__ign.resetQuality();
      this.post.setBloom(C.bloom.intensity, C.bloom.radius, C.bloom.threshold);
      this.post.resetExposure();
      this.post.setFlare(0.5, 0.5, 0);
      this.smoke.mesh.visible = true;
      if (this.wet) this.wet.enabled = true;
      this.post.resetSmokeHistory();
      this.ui.setFade(1, 0);
      this.ui.setFade(0, 1.6);
      this.ui.showTimer(false);
      this.ui.hideConfirm();
      this.ui.hideEnd();
      this.inOrbit = false;
      document.title = 'ignition';
    }
    this.fading = false;
    this.smoke.clearDynamic();
    this.S.rocket.position.set(0, 0, 0);
    this.S.rocket.visible = true;
    this.S.booster.visible = false;
    this.alt = 0;
    this.flightT = 0;
    this.flash = 0;
    this.trenchGlow = 0;
    this.power = [0, 0, 0, 0];
    this.bellGlow = 0;
    this.separated = false;
    this.sepInfo = null;
    this.ended = false;
    this.rig.reset();
    this.rocketPos.set(0, 0, 0);
    this.mainPlume.set({ power: 0 });
    this.ui.hideAll();
  }

  abort() {
    this.state = 'abort';
    this.abortT = 0;
    // engines cut: a big cold vapor cloud rolls out and settles
    const n = 110;
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), s = rand(2.5, 9);
      this.smoke.spawn({
        bulk: true,
        x: rand(-3, 3), y: rand(-1.5, 2.5), z: rand(-3, 3),
        vx: Math.cos(a) * s, vy: rand(0.5, 3.5), vz: Math.sin(a) * s,
        size: rand(3, 6.5), grow: rand(2.5, 4.5), life: rand(7, 12), alpha: rand(0.28, 0.42),
        base: [0.30, 0.30, 0.31], drag: 0.78, buoy: 0.35, lightR: 18, heat: rand(0, 0.25), shade: 0.5,
      });
    }
    this.sound.thump(0.25);
  }

  ignite() {
    // start streaming the window's imagery now: the launch gives it ~9 seconds
    this.orbit.prefetch(1, this.focusMinutes * 60);
    this.orbit.prefetch(OB.nightOpen + 10, this.focusMinutes * 60);
    this.state = 'flight';
    this.flightT = 0;
    this.flash = 1;
    this.sound.thump(1);
    tap('heavy');
    this.ui.hideAll();
  }

  enterOrbit() {
    this.state = 'orbit';
    this.inOrbit = true;
    this.flightT = 0;
    this.sessionStarted = false;
    this.sunsetCued = false;
    this.smoke.clearDynamic();
    this.smoke.mesh.visible = false;
    if (this.wet) this.wet.enabled = false;
    this.post.resetSmokeHistory();
    this.orbitStart = now();
    this.sessionEnd = OB.nightOpen + this.focusMinutes * 60;   // seconds after the cut: the sunset
    sessionBegin(Date.now() + this.sessionEnd * 1000);
    this.leaves = 0;
    this.away = false;
    this.orbit.enter(this.focusMinutes * 60);
    if (window.__ign && window.__ign.resetQuality) window.__ign.resetQuality();
    this.ui.setPlace(true);
    this.post.setLayers([[this.orbit.earth.scene, this.orbit.earth.camera], [this.orbit.cabin.scene, this.camera]]);
    this.post.setMetering(C.autoExposure.orbit);
    this.post.setToneMapping(C.post.orbitToneMapping);
    this.post.resetExposure();
    this.post.setFlash(0);
    this.post.setHeat(0.5, 0.5, 0.1, 0.1, 0);
    this.post.setMotionBlur(0);
    this.post.setAnamorphic(0);
    this.post.setAberration(C.post.aberration * 0.5);
    this.post.setBloom(C.bloom.orbitIntensity, C.bloom.orbitRadius, C.bloom.orbitThreshold);
    this.sound.setRumble(0);
    this.sound.setRoar(0, 200);
    this.sound.setHum(1);
    for (const p of [...this.enginePlumes, this.mainPlume, ...this.splash]) p.set({ power: 0 });
    this.S.engineLight.intensity = 0; this.S.trenchLight.intensity = 0; this.S.bounceLight.intensity = 0;
    this.ui.setFade(1, 0);
    this.ui.setFade(0, OB.fadeIn);
    this.ui.hideAll();
    this.ui.showPresets(false);
    this.ui.showTimer(false);
  }

  // ------------------------------------------------------------------ the focus session
  get inSession() { return this.inOrbit && this.state === 'orbit' && this.sessionStarted; }
  // seconds left, from real timestamps
  remaining() { return this.sessionEnd - (now() - this.orbitStart); }

  // page visibility: a leave counts only while the session is running
  onHidden() {
    if (this.inSession && !this.away) { this.away = true; this.leaves++; }
    appHidden();
  }
  onVisible() {
    appVisible();
    if (this.away) { this.away = false; this.orbit.flicker(); }
  }

  // Escape: quietly ask before ending
  requestEnd() {
    if (!this.inOrbit || this.state !== 'orbit') return false;
    if (this.ui.confirming) { this.ui.answer(false); return true; }
    this.ui.askEnd();
    return true;
  }
  endEarly() {
    if (!this.inOrbit || this.state !== 'orbit') return;
    const t = now() - this.orbitStart;
    if (!this.sessionStarted) {
      // still night: nothing to set, go straight to the end
      this.sessionEnd = t;
      this.orbit.early = { t0: t, h0: this.orbit.sunHeight(t, this.focusMinutes * 60), az0: OB.riseAzimuth };
      sessionMoved(Date.now());
      return;
    }
    if (this.sessionEnd - t <= OB.earlySet) return;   // the sun is already on its way down
    this.sessionEnd = this.orbit.endEarly(t);
    sessionMoved(Date.now() + this.remaining() * 1000);
  }

  // the tab title, driven by a worker tick so it keeps counting while the tab is hidden
  tickTitle() {
    const txt = this.inSession ? `${formatClock(this.remaining())} · ignition` : 'ignition';
    if (document.title !== txt) document.title = txt;
  }

  updateOrbit(dt, time) {
    const t = now() - this.orbitStart;          // seconds since the cut
    const sinceRise = t - OB.nightOpen;
    const total = this.focusMinutes * 60;
    if (this.state === 'orbit') {
      if (sinceRise >= 0 && !this.sessionStarted && this.sessionEnd > OB.nightOpen) {
        this.sessionStarted = true;
        this.ui.showTimer(true);
        this.sound.sunriseSwell(total);   // the second ignition: the organ rises with the sun
        this.nextPad = OB.nightOpen + 90 + C.audio.padEvery[0];
      }
      if (this.sessionStarted) {
        const left = this.sessionEnd - t;
        // the sunset chord is cued so it dies away exactly at zero (an early end cues it too)
        const lead = Math.min(55, Math.max(8, total * 0.4));
        if (!this.sunsetCued && left <= lead) { this.sunsetCued = true; this.sound.sunsetChord(left); }
        // long sessions: a faint pad every few minutes, never near sunrise or sunset
        if (total > 480 && t > this.nextPad && left > 120) {
          this.sound.pad();
          this.nextPad = t + C.audio.padEvery[0] + Math.random() * (C.audio.padEvery[1] - C.audio.padEvery[0]);
        }
      }
      if (this.sessionStarted) this.ui.setTimer(this.remaining());
      if (t >= this.sessionEnd) {
        this.state = 'orbitEnd';
        this.ui.setTimer(0);
        this.ui.hideConfirm();
        this.ui.hideEnd();
        this.sound.endTone && this.sound.endTone();
        sessionFinish();
      }
    }
    if (this.state === 'orbitEnd') {
      if (t > this.sessionEnd + 1.5) this.ui.showTimer(false);
      if (t > this.sessionEnd + OB.settleAfterSunset) {
        this.state = 'ended';
        this.ui.ended(this.leaves);
        askForReminders();
        this.tickTitle();
      }
    }
    this.orbit.update(t, dt, time, this.S.stars.uniforms.uPixelRatio.value);
    const o = this.orbit;
    // the countdown lives on the inner pane, low in the porthole: project that point to the screen
    {
      const p = o.cabin.toWorld(...C.cabin.timerOnGlass, this._v).project(this.camera);
      this.ui.placeTimer((p.x * 0.5 + 0.5) * window.innerWidth, (0.5 - p.y * 0.5) * window.innerHeight);
    }
    this.post.setExposure(C.render.exposure);
    this.post.setFlare(o.sunScreen.x, o.sunScreen.y, o.sunInFront ? o.sunInView * C.post.flare : 0);
    this.sound.setRumble(0);
  }

  // ------------------------------------------------------------------ helpers
  bellWorld(i, out) {
    return out.copy(this.S.bells[i]).add(this.S.rocket.position);
  }

  emitVapor(dt, p) {
    const R = C.rocket;
    this.acc.vapor += (2 + p * 34) * dt;
    while (this.acc.vapor >= 1) {
      this.acc.vapor -= 1;
      this.smoke.spawn({
        x: R.radius + 0.6, y: R.ventHeight + rand(-0.4, 0.4) + this.S.rocket.position.y, z: 0.3 + rand(-0.2, 0.2),
        vx: rand(2.5, 5) + p * 9, vy: rand(-0.6, 0.8) - p * 1.5, vz: rand(-0.8, 0.8),
        size: 0.8, grow: 1.3 + p * 1.6, life: rand(2, 3.6), alpha: 0.2 + p * 0.1,
        base: CO.vapor, lightR: 12, drag: 0.72, buoy: 0.35, shade: 0.4, rotv: rand(-0.8, 0.8),
      });
    }
  }

  emitHoldSmoke(dt, rate) {
    this.acc.hold += rate * dt;
    while (this.acc.hold >= 1) {
      this.acc.hold -= 1;
      const s = randSign();
      this.smoke.spawn({
        x: s * rand(6, 14), y: rand(-1.5, 0.5), z: rand(-3, 3),
        vx: s * rand(3, 9), vy: rand(0.4, 2.5), vz: rand(-2, 2),
        size: rand(2.5, 5.5), grow: rand(2, 3.5), life: rand(7, 11), alpha: rand(0.45, 0.6),
        drag: 0.86, buoy: 0.6, heat: rand(0, 0.35),
      });
    }
  }

  emitEruption(dt, rate) {
    this.acc.erupt += rate * dt;
    while (this.acc.erupt >= 1) {
      this.acc.erupt -= 1;
      const s = randSign();
      this.smoke.spawn({
        x: s * rand(8, 20), y: rand(-2.5, 1.5), z: rand(-3.5, 3.5),
        vx: s * rand(16, 42), vy: rand(1, 8), vz: rand(-10, 10),
        size: rand(4.5, 9.5), grow: rand(4, 8), life: rand(22, 40), alpha: rand(0.55, 0.85),
        drag: 0.86, buoy: 0.55, heat: rand(0, 0.7),
      });
    }
  }

  emitPadSplash(dt, rate) {
    this.acc.splash += rate * dt;
    while (this.acc.splash >= 1) {
      this.acc.splash -= 1;
      const a = rand(0, Math.PI * 2), s = rand(7, 19), r = rand(3, 9);
      this.smoke.spawn({
        x: Math.cos(a) * r, y: rand(0, 3), z: Math.sin(a) * r,
        vx: Math.cos(a) * s, vy: rand(2, 7), vz: Math.sin(a) * s,
        size: rand(4, 8), grow: rand(4, 7), life: rand(18, 30), alpha: rand(0.5, 0.8),
        drag: 0.85, buoy: 1.0, heat: rand(0.2, 0.9),
      });
    }
  }

  emitTrail(dt, rate) {
    this.acc.trail += rate * dt;
    const e = this.enginePos;
    while (this.acc.trail >= 1) {
      this.acc.trail -= 1;
      this.smoke.spawn({
        x: e.x + rand(-1.6, 1.6), y: e.y - 4 + rand(-2, 0), z: e.z + rand(-1.6, 1.6),
        vx: rand(-5, 5), vy: -rand(22, 46), vz: rand(-5, 5),
        size: rand(2.2, 4), grow: rand(7, 11), life: rand(6, 10), alpha: rand(0.5, 0.75),
        drag: 0.72, buoy: 2.2, lightR: 24, heat: rand(0.8, 1.8),
      });
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, time) {
    this.time = time;
    const S = this.S;
    let shake = 0;
    let totalPower = 0;
    let sparkRate = 0;
    let blinkPeriod = 1.7;
    let holdP = 0;

    // ---- state logic
    if (this.state === 'idle' || this.state === 'ended') {
      this.emitVapor(dt, 0);
    } else if (this.state === 'hold') {
      this.holdT += dt;
      const t = this.holdT;
      holdP = clamp(t / H.duration, 0, 1);
      this.ui.hold(holdP);
      this.emitVapor(dt, holdP);
      blinkPeriod = lerp(1.7, 0.16, sstep(0, H.duration, t));
      shake = lerp(0.02, C.camera.shake.holdMax, Math.pow(holdP, 1.6));
      // stage 2
      sparkRate = sstep(H.stage1End, H.stage1End + 0.5, t) * C.sparks.rate;
      this.bellGlow = sstep(H.stage1End, H.stage2End, t);
      this.emitHoldSmoke(dt, SM.holdRate * sstep(H.stage1End + 0.3, H.stage2End, t));
      // stage 3: engines light one by one
      for (let i = 0; i < 4; i++) this.power[i] = sstep(H.engineIgnite[i], H.engineIgnite[i] + H.igniteRamp, t);
      const avg = (this.power[0] + this.power[1] + this.power[2] + this.power[3]) / 4;
      this.emitEruption(dt, SM.eruptionRate * 0.55 * avg);
      if (t >= H.duration) { this.ui.showRelease(); if (!this.readyTapped) { this.readyTapped = true; tap('light'); } }
      this.sound.setRumble(Math.pow(holdP, 1.4) * 0.9);
      this.sound.setRoar(avg * 0.85, 700 + avg * 600);
      this.sound.crackle(sparkRate * 0.05, dt, 1);
    } else if (this.state === 'abort') {
      this.abortT += dt;
      for (let i = 0; i < 4; i++) this.power[i] = expDecay(this.power[i], 0, 8, dt);
      this.bellGlow = expDecay(this.bellGlow, 0, 3, dt);
      shake = 0.12 * Math.exp(-this.abortT * 2);
      blinkPeriod = 0.4;
      this.emitVapor(dt, 0.3 * Math.exp(-this.abortT));
      this.sound.setRumble(0.4 * Math.exp(-this.abortT * 1.5));
      this.sound.setRoar(0, 300);
      if (this.abortT > H.abortDuration) {
        this.state = 'idle';
        this.ui.idle();
      }
    } else if (this.state === 'flight') {
      this.flightT += dt;
      this.orbit.earth.tiles.pump();
      const u = Math.max(this.flightT - LF.clampHold, 0);
      this.alt = LF.accelA * u * u + LF.accelB * u * u * u;
      const drift = LF.driftX * u * u;
      this.rocketPos.set(drift, this.alt, 0);
      for (let i = 0; i < 4; i++) this.power[i] = 1;
      this.bellGlow = 1;
      // flash: a few overexposed frames, then a fast settle
      this.flash = this.flightT < 0.09 ? 1 : Math.exp(-(this.flightT - 0.09) / LF.flashDecay);
      this.flash = this.flash * this.flash;
      const liftShake = C.camera.shake.liftoff / (1 + this.alt / C.camera.shake.decayAlt);
      shake = liftShake + this.flash * 0.5;
      blinkPeriod = 0.16;

      // smoke: hero eruption then the rolling ground cloud, then the trail
      this.emitEruption(dt, SM.eruptionRate * (1 - sstep(4, 9, u)));
      this.emitPadSplash(dt, 90 * sstep(0.3, 1.5, this.flightT) * (1 - sstep(3, 7.5, u)));
      if (this.alt > 5) this.emitTrail(dt, SM.trailRate * (1 - sstep(320, 750, this.alt)));

      // staging
      if (!this.separated && u >= LF.stageSepTime) {
        this.separated = true;
        this.sepT = 0;
        this.sepInfo = { pos: this.rocketPos.clone(), vel: 2 * LF.accelA * u + 3 * LF.accelB * u * u };
        this.flash = Math.max(this.flash, 0.16);
        this.sound.thump(0.35);
      }
      if (this.separated) this.sepT += dt;

      if (u > LF.fadeStart && !this.fading) {
        this.fading = true;
        this.ui.setFade(1, LF.fadeDuration);
      }
      if (u > LF.fadeStart + LF.fadeDuration + 0.05) this.enterOrbit();
      const dist = this.alt + 40;
      this.sound.setRumble(0.9 / (1 + this.alt / 250));
      this.sound.setRoar(1 / (1 + this.alt / 700), 1400 / (1 + this.alt / 220) + 50);
      this.sound.crackle(40 / (1 + this.alt / 100), dt, 0.6);
    }
    if (this.inOrbit) {
      this.updateOrbit(dt, time);
      return;
    }
    if (this.state === 'ended' && this.flightT > 0) {
      // the vehicle keeps climbing as a point of light while the pad settles
      this.flightT += dt;
      const u = Math.max(this.flightT - LF.clampHold, 0);
      this.alt = LF.accelA * u * u + LF.accelB * u * u * u;
      this.rocketPos.set(LF.driftX * u * u, this.alt, 0);
      if (this.separated) this.sepT += dt;
      this.sound.setRumble(0.9 / (1 + this.alt / 250));
      this.sound.setRoar(1 / (1 + this.alt / 700), 1400 / (1 + this.alt / 220) + 50);
    }
    if (this.state === 'idle' || this.state === 'abort') {
      this.flash = expDecay(this.flash, 0, 6, dt);
    }
    if (this.state !== 'flight' && this.state !== 'ended') this.ui.setSound && 0;

    totalPower = (this.power[0] + this.power[1] + this.power[2] + this.power[3]) / 4;
    const inFlight = this.state === 'flight' || (this.state === 'ended' && this.flightT > 0);

    // ---- rocket transform (strain against the clamps while held down)
    const R = S.rocket;
    // vibration against the clamps: only while held down, gone once the vehicle is moving
    const strain = (inFlight && this.flightT < LF.clampHold ? 1 : totalPower) * (1 - sstep(0.5, 6, this.alt));
    R.position.copy(this.rocketPos);
    R.position.y += strain * 0.14 + Math.sin(time * 47) * 0.05 * strain + Math.sin(time * 71) * 0.03 * strain;
    R.position.x += Math.sin(time * 39) * 0.04 * strain;
    if (this.separated) {
      // upper stage only: hide the booster body and show the coasting stage as an ember
      R.visible = this.alt < 60;
    }

    // ---- engine position and lights
    // lights and emitters follow the smooth trajectory, never the vibration, so nothing strobes
    this.enginePos.set(this.rocketPos.x, this.rocketPos.y + strain * 0.14 + C.rocket.bodyBottom - 1.8, this.rocketPos.z);
    const nearGround = 1 - sstep(4, 60, this.alt);
    // engines idle at a fraction of thrust while held down; full thrust (and the flash) only at release
    this.thrust = expDecay(this.thrust ?? LI.holdThrust, inFlight ? 1 : LI.holdThrust, 10, dt);
    const flashBoost = (1 + this.flash * LI.flashBoost) * this.thrust;
    const upperScale = this.separated ? 0.55 : 1;
    const flick = 0.93 + 0.14 * (wobble(time * 4.5, 3.3) * 0.5 + 0.5) * totalPower;
    S.engineLight.position.copy(this.enginePos);
    S.engineLight.intensity = totalPower * LI.engineFull * flashBoost * upperScale * flick;
    // trench splash lights sit on the pad surface either side of the rocket
    this.trenchGlow = inFlight
      ? Math.max(nearGround, Math.exp(-Math.max(this.flightT - LF.clampHold - 2.5, 0) / LI.padResidualDecay) * 0.9)
      : expDecay(this.trenchGlow, totalPower * 0.9, 3, dt);
    if (this.state === 'ended' && this.flightT - LF.clampHold > LF.endFadeStart) this.trenchGlow *= Math.exp(-dt * 0.4);
    S.trenchLight.position.set(12, 2.5, 7);
    S.bounceLight.position.set(-13, 2.5, -5);
    const flick2 = 0.92 + 0.16 * (wobble(time * 3.8, 8.1) * 0.5 + 0.5);
    S.trenchLight.intensity = this.trenchGlow * LI.trenchFull * flashBoost * flick2;
    S.bounceLight.intensity = this.trenchGlow * LI.trenchFull * 0.7 * flashBoost * (1.2 - flick2 * 0.5);

    // smoke lighting sources
    this.smoke.light.pos.copy(this.enginePos);
    this.smoke.light.intensity = totalPower * flashBoost * upperScale;
    this.smoke.trench.pos.set(0, 0.5, 0);
    this.smoke.trench.intensity = this.trenchGlow * LI.trenchSmoke * flashBoost;

    // bells
    for (let i = 0; i < 4; i++) {
      S.bellMats[i].emissiveIntensity = this.bellGlow * LI.bellGlowMax * 0.35 + this.power[i] * LI.bellGlowMax;
    }

    // sparks under the bells
    if (sparkRate > 0) {
      this.acc.sparks += sparkRate * dt;
      const per = Math.floor(this.acc.sparks / 4);
      if (per > 0) {
        this.acc.sparks -= per * 4;
        for (let i = 0; i < 4; i++) this.sparks.emit(this.bellWorld(i, this._v).add(new THREE.Vector3(0, -0.3, 0)), per, 0.9);
      }
    }

    // ---- plumes
    const jelly = sstep(PL.jellyStartAlt, PL.jellyFullAlt, this.alt);
    const closePlume = 1 - sstep(60, 160, this.alt);
    for (let i = 0; i < 4; i++) {
      const p = this.power[i] * (this.separated ? 0 : 1);
      const origin = this.bellWorld(i, this._v);
      origin.y += 0.15;
      this.enginePlumes[i].set({
        origin, axis: new THREE.Vector3(0, -1, 0),
        len: PL.engineLenPad * (0.55 + 0.45 * p) * (1 + sstep(0, 60, this.alt) * 1.2),
        width: PL.engineWidthPad * (0.7 + 0.3 * p),
        power: p * closePlume * (1 + this.flash * 1.2), diamonds: 5, coreLen: 0.7, fall: 1.5, expand: 1, bright: 1,
      });
      this.enginePlumes[i].update(time);
    }
    // combined column once airborne (and the upper-stage engine after staging)
    {
      let p = inFlight ? sstep(3, 18, this.alt) : 0;
      let width = PL.mainWidth, bright = 1, len = PL.mainLen * (1 + jelly * 3.5 + Math.min(this.alt, 3000) * 0.012);
      if (this.separated) {
        const relit = sstep(LF.upperRelight, LF.upperRelight + 0.6, this.sepT);
        p *= relit; width *= 0.5; bright *= 0.7;
      }
      this.mainPlume.set({
        origin: this.enginePos, axis: new THREE.Vector3(0, -1, 0),
        len, width, power: p * (1 + this.flash * 0.5),
        expand: 1 + jelly * PL.jellyExpand, fall: lerp(2.6, 1.1, jelly), bright: lerp(bright * 0.7, bright * 0.5, jelly),
        diamonds: lerp(4, 0, jelly), coreLen: lerp(0.35, 0.2, jelly),
      });
      this.mainPlume.update(time);
    }
    // flame deflected along the trench, both directions
    {
      const p = totalPower * nearGround * (inFlight ? 1 : 0.85) * (1 + this.flash * 1.5);
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? 1 : -1;
        this.splash[k].set({
          origin: new THREE.Vector3(s * 5.5, 0.4, 0), axis: new THREE.Vector3(s, 0.06, 0),
          len: PL.splashLen * (0.5 + 0.5 * p), width: PL.splashWidth, power: p, diamonds: 0, coreLen: 0.35, fall: 1.25, expand: 1.2, bright: 0.85,
        });
        this.splash[k].update(time);
      }
    }

    // ---- booster after separation: a dim tumbling ember drifting away from the trail
    if (this.separated && this.sepInfo) {
      const t = this.sepT;
      const b = S.booster;
      const info = this.sepInfo;
      b.position.set(info.pos.x - t * 6, info.pos.y + info.vel * t * 0.55 - 4 * t * t, info.pos.z + t * 3);
      const k = (0.8 * Math.exp(-t / 2.5) + (t < 0.3 ? 1.5 : 0)) * 30;
      b.material.color.setRGB(k, k * 0.42, k * 0.12);
      b.visible = true;
      b.scale.setScalar(2.5);
    }

    // ---- warning lights
    this.blink += dt;
    const on = (this.blink % blinkPeriod) < blinkPeriod * 0.42;
    for (let i = 0; i < S.warnLights.length; i++) {
      const phaseOn = ((this.blink + i * 0.31) % blinkPeriod) < blinkPeriod * 0.42;
      const lit = (i < 5 ? on : phaseOn) ? 3.2 : 0.03;
      S.warnLights[i].color.setRGB(CO.warning[0] * lit, CO.warning[1] * lit, CO.warning[2] * lit);
    }

    // ---- exposure and sky: the fire drives the whole frame's exposure
    this.post.setExposure(C.render.exposure);
    S.stars.uniforms.uTime.value = time;
    S.stars.uniforms.uDim.value = clamp(1 - totalPower * 0.8 - this.flash, 0, 1);
    S.sky.uniforms.uGlow.value = (totalPower * 0.009 * (1 / (1 + this.alt / 350)) * upperScale + this.flash * 0.05 + this.trenchGlow * 0.004) * LI.skyGlow;
    S.sky.uniforms.uGlowDir.value.set(-this.camera.position.x, 0, -this.camera.position.z);

    // ---- post: flash, bloom, heat shimmer above the engines
    this.post.setFlash(this.flash);
    this.post.setBloom(lerp(C.bloom.intensity, C.bloom.flashIntensity, this.flash));
    this.post.setAberration(C.post.aberration * (1 + this.flash * 3 + shake * 1.0));
    {
      const v = this._v.copy(this.enginePos).project(this.camera);
      const dist = this.camera.position.distanceTo(this.enginePos);
      const scale = clamp(150 / dist, 0.05, 2.5);
      const strength = totalPower * upperScale * (1 - sstep(500, 1600, this.alt)) * (0.55 + 0.45 * nearGround) + this.bellGlow * 0.25 * (1 - totalPower);
      this.post.setHeat((v.x + 1) / 2, (v.y + 1) / 2, 0.12 * scale, 0.42 * scale, v.z < 1 ? strength : 0);
    }

    // ---- streak, motion blur
    this.post.setAnamorphic(C.post.anamorphic * (0.5 + totalPower * 0.5 + this.flash * 2.0));
    this.post.setMotionBlur(clamp(shake * 0.9, 0, 1));

    // ---- camera
    this.rig.update(dt, this.rocketPos, this.alt, shake, 1);
  }
}
