import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, lerp, sstep, fovFor } from '../util.js';
import { EarthScene } from './earth.js';
import { Cabin } from './cabin.js';

const OB = CONFIG.orbit, E = CONFIG.earth, CB = CONFIG.cabin;
const DEG = Math.PI / 180;

// ---- CPU copy of the atmosphere model, for the colour of the sunlight that reaches the window
const BR = [5.802e-3, 13.558e-3, 33.1e-3], BM = 3.996e-3 + 0.444e-3, BO = [0.650e-3, 1.881e-3, 0.085e-3].map((v) => v * CONFIG.earth.ozoneGain);
function sunTransmittance(o, d, out) {
  const K = E.atmosphereScale;   // same vertical stretch as atmoconst.glsl
  const RG = 6371, RT = 6371 + 100 * K;
  const b = o.dot(d), L = o.length();
  // ground in the way?
  const cg = (L - RG) * (L + RG), dg = b * b - cg;
  if (dg > 0 && -b - Math.sqrt(dg) > 0) return out.set(0, 0, 0);
  const ct = (L - RT) * (L + RT), dt = b * b - ct;
  if (dt <= 0) return out.set(1, 1, 1);
  const s = Math.sqrt(dt), t0 = Math.max(-b - s, 0), t1 = -b + s;
  if (t1 <= 0) return out.set(1, 1, 1);
  const N = 64, h = (t1 - t0) / N;
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < N; i++) {
    const t = t0 + (i + 0.5) * h;
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const altKm = Math.sqrt(x * x + y * y + z * z) - RG;
    if (altKm < 0) return out.set(0, 0, 0);
    const alt = altKm / K;
    const dr = Math.exp(-alt / 8), dz = Math.max(0, 1 - Math.abs(alt - 25) / 15);
    // same aerosol profile as atmoconst.glsl: boundary layer + thin stratospheric background
    const sh = Math.min(1, Math.max(0, alt / 12)), dm = Math.exp(-alt / 1.2) + 0.015 * Math.exp(-Math.max(alt - 12, 0) / 7) * sh * sh * (3 - 2 * sh);
    r += (BR[0] * dr + BM * dm + BO[0] * dz) * h / K;
    g += (BR[1] * dr + BM * dm + BO[1] * dz) * h / K;
    bl += (BR[2] * dr + BM * dm + BO[2] * dz) * h / K;
  }
  // never bluer than green: the pure model turns the grazing sun magenta (ozone takes the green);
  // stratospheric aerosols and refraction, which we do not model, keep the real one orange
  const G = Math.exp(-g);
  return out.set(Math.exp(-r), G, Math.min(Math.exp(-bl), G));
}

// smooth minimum (keeps the top of the sun's arc round)
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };

// Low Earth orbit seen through a porthole. The timeline (seconds since the cut) runs:
// night open -> sunrise (the session starts) -> the sun arcs over -> sunset exactly at the end -> night.
export class Orbit {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.earth = new EarthScene(renderer);
    this.cabin = new Cabin();
    this.sunDir = this.earth.sunDir;
    this.sunCol = new THREE.Vector3();
    this.sunVis = 0;           // sun above the limb (0..1)
    this.sunInView = 0;        // sun disc visible through the window from the eye
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.sessionSeconds = 60;
    this.dip = Math.acos(E.radius / (E.radius + E.altitude)) / DEG;
    this.flickerT = -1;
    this.saved = null;
    this._o = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this.led = 0;
    this.flashes = [];            // active lightning: { dir (Earth-fixed), t, dur, pulses }
    this.nextFlash = 2;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
  }

  // lightning: short multi-pulse flashes at random spots of the night side inside the window view
  updateLightning(t, dt, dark) {
    const u = this.earth.uniforms.uFlash.value;
    if (dark > 0.5 && t > this.nextFlash) {
      this.nextFlash = t + E.flashEvery[0] + Math.random() * (E.flashEvery[1] - E.flashEvery[0]);
      // try a few spots in view and keep one inside a real cloud (lightning lives in thunderheads)
      for (let tries = 0; tries < 24; tries++) {
        this._ndc.set((Math.random() - 0.5) * 0.9, -0.1 - Math.random() * 0.75);
        this._ray.setFromCamera(this._ndc, this.earth.camera);
        const o = this._ray.ray.origin.clone().sub(this.earth.center), d = this._ray.ray.direction;
        const b = o.dot(d), c = o.lengthSq() - this.earth.R * this.earth.R, disc = b * b - c;
        if (disc <= 0) continue;
        const local = o.add(d.clone().multiplyScalar(-b - Math.sqrt(disc))).normalize().applyQuaternion(this.earth.earth.quaternion.clone().invert());
        const inStorm = (this.stormList || []).some((st) => local.angleTo(st.dir) < st.radius * 0.8);
        if (!inStorm && this.earth.coverageAt(local, this.earth.uniforms.uCloudShift.value) < E.flashMinCoverage) continue;
        const pulses = 1 + Math.floor(Math.random() * 4);
        this.flashes.push({ dir: local, t: 0, dur: 0.12 + pulses * 0.09, pulses, gain: E.flashGain * (0.4 + Math.random() * 0.8) });
        break;
      }
      if (this.flashes.length > 3) this.flashes.shift();
    }
    for (let k = 0; k < 3; k++) {
      const f = this.flashes[k];
      if (!f) { u[k].w = 0; continue; }
      f.t += dt;
      // flicker: a few sharp strokes inside the envelope
      const env = Math.sqrt(Math.max(0, 1 - f.t / f.dur));
      const stroke = Math.pow(Math.abs(Math.sin(f.t * Math.PI * f.pulses / f.dur)), 6);
      u[k].set(f.dir.x, f.dir.y, f.dir.z, env * stroke * f.gain);
    }
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
  }

  get ready() { return this.earth.ready; }

  // the sun's height above the limb (degrees) at time t (s since the cut) for a session of T seconds
  sunHeight(t, T) {
    const e = this.early;
    if (e && t > e.t0) {
      // ended early: glide from wherever the sun was down to the limb over earlySet seconds
      const k = (t - e.t0) / OB.earlySet;
      if (k >= 1) return -OB.setDepth - (t - e.t0 - OB.earlySet) * OB.preRiseRate;
      const s = k * k * (3 - 2 * k);
      return lerp(e.h0, -OB.setDepth, s);
    }
    return this.plannedHeight(t, T);
  }
  plannedHeight(t, T) {
    const tr = OB.nightOpen;
    if (t < tr) return -OB.preRiseDepth * Math.pow(1 - t / tr, 1.7);
    const tau = t - tr;
    const H = lerp(OB.arcMin, OB.arcMax, clamp((T - 60) / 840, 0, 1));
    const tR = clamp(T * 0.4, 24, 900);
    const v0 = OB.riseRate;
    const a = Math.max(0, (H - v0 * tR) / (tR * tR));
    const f = (x) => (x <= 0 ? x * v0 : v0 * x + a * x * x);
    if (tau > T) return -OB.setDepth - (tau - T) * OB.preRiseRate;
    // rise, soft top, set: the last light leaves the limb exactly at tau = T
    return Math.min(smin(f(tau), f(T - tau) - OB.setDepth, 6), H);
  }
  sunAzimuth(t, T) {
    const e = this.early;
    if (e && t > e.t0) return lerp(e.az0, OB.setAzimuth, sstep(0, 1, (t - e.t0) / OB.earlySet));
    const tau = t - OB.nightOpen;
    return lerp(OB.riseAzimuth, OB.setAzimuth, sstep(0, 1, clamp(tau / T, 0, 1)));
  }

  // bring the sunset forward: the sun reaches the limb OB.earlySet seconds after t
  endEarly(t) {
    this.early = { t0: t, h0: this.sunHeight(t, this.sessionSeconds), az0: this.sunAzimuth(t, this.sessionSeconds) };
    return t + OB.earlySet;
  }

  // the Earth-fixed point the window looks at (ndc) at time t
  groundAt(t, ndcX, ndcY) {
    const cab = this.cabin;
    const eye = cab.toWorld(CB.eye[0], CB.eye[1], CB.eye[2], new THREE.Vector3());
    const look = cab.toWorld(CB.look[0], CB.look[1], CB.look[2], new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 1, 10);
    cam.up.set(0, 1, 0).applyQuaternion(cab.win.quaternion);
    cam.position.set(0, 0, 0); cam.lookAt(look.sub(eye)); cam.updateMatrixWorld();
    const saved = this.earth.earth.quaternion.clone();
    this.earth.setTravel(t * OB.groundSpeed);
    this._ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const o = this._ray.ray.origin.clone().sub(this.earth.center), d = this._ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - this.earth.R * this.earth.R, disc = b * b - c;
    const q = this.earth.earth.quaternion.clone().invert();
    this.earth.earth.quaternion.copy(saved); this.earth.earth.updateMatrixWorld();
    this.earth.uniforms.uEarthRot.value.setFromMatrix4(this.earth.earth.matrixWorld);
    this.earth.uniforms.uEarthRotT.value.copy(this.earth.uniforms.uEarthRot.value).transpose();
    if (disc <= 0) return null;
    return o.add(d.clone().multiplyScalar(-b - Math.sqrt(disc))).normalize().applyQuaternion(q);
  }

  // thunderstorm clusters where the window will look during the night passes (opening, after sunset)
  placeStorms(sessionSeconds) {
    const R = E.radius, list = [];
    const add = (t, x, y, km) => { const d = this.groundAt(t, x, y); if (d) list.push({ dir: d, radius: km / R }); };
    add(2, 0.18, -0.3, E.stormRadius);
    add(2, -0.35, -0.05, E.stormRadius * 0.7);
    const tEnd = OB.nightOpen + sessionSeconds + 5;
    add(tEnd, -0.1, -0.35, E.stormRadius);
    add(tEnd, 0.4, -0.1, E.stormRadius * 0.6);
    this.stormList = list;
    this.earth.setStorms(list);
  }

  enter(sessionSeconds) {
    this.sessionSeconds = sessionSeconds;
    this.early = null;
    this.placeStorms(sessionSeconds);
    const c = this.camera;
    this.saved = { fov: c.fov, near: c.near, far: c.far, up: c.up.clone() };
    c.fov = fovFor(CB.fov, c.aspect, CB.minHFov); c.near = 0.01; c.far = 30;
    c.updateProjectionMatrix();
    this.update(0, 0, 0, 1);
  }

  exit() {
    const c = this.camera, s = this.saved;
    if (!s) return;
    c.fov = s.fov; c.near = s.near; c.far = s.far; c.up.copy(s.up);
    c.updateProjectionMatrix();
    this.saved = null;
  }

  flicker() { this.flickerT = 0; }

  // Ask for the imagery the window will show at time t (seconds since the cut), without drawing it.
  // Used during the launch so the cut opens on loaded tiles, and ahead of the ground track later.
  prefetch(t, sessionSeconds = this.sessionSeconds) {
    const cab = this.cabin;
    const eye = cab.toWorld(CB.eye[0], CB.eye[1], CB.eye[2], new THREE.Vector3());
    const look = cab.toWorld(CB.look[0], CB.look[1], CB.look[2], new THREE.Vector3());
    const axis = look.sub(eye).normalize();
    const saved = this.earth.earth.quaternion.clone();
    this.earth.setTravel(t * OB.groundSpeed);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.earth.updateTiles(buf.y / (CB.fov * DEG), axis, Math.cos(CB.tileCone * DEG), true);
    this.earth.earth.quaternion.copy(saved);
    this.earth.earth.updateMatrixWorld();
    this.earth.uniforms.uEarthRot.value.setFromMatrix4(this.earth.earth.matrixWorld);
    this.earth.uniforms.uEarthRotT.value.copy(this.earth.uniforms.uEarthRot.value).transpose();
  }

  // t: seconds since the cut to orbit; returns nothing, exposes sunVis / sunInView / sunScreen / phase
  update(t, dt, time, pixelRatio) {
    const T = this.sessionSeconds;
    const h = this.sunHeight(t, T);
    const az = this.sunAzimuth(t, T);
    const el = (-this.dip + h) * DEG;
    this.sunDir.set(Math.sin(az * DEG) * Math.cos(el), Math.sin(el), -Math.cos(az * DEG) * Math.cos(el)).normalize();
    this.sunHeightDeg = h;

    // the ground slides across the window at orbital speed; clouds drift a little on top
    this.earth.setTravel(t * OB.groundSpeed);
    this.earth.update(time, pixelRatio, t * OB.cloudDrift);

    // sunlight reaching the spacecraft (reddened and dimmed through the limb)
    this._o.copy(this.earth.center).negate();
    sunTransmittance(this._o, this.sunDir, this.sunCol);
    { // a little less saturated than the raw model: the sliver of sun is orange, not a red lamp
      const c = this.sunCol, l = c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;
      c.lerp(this._p.set(l, l, l), OB.sunDesaturate);
    }
    const lum = this.sunCol.x * 0.2126 + this.sunCol.y * 0.7152 + this.sunCol.z * 0.0722;
    this.sunVis = clamp(lum * 1.4, 0, 1);

    // ---- camera: the eye floats in front of the porthole, drifting and swaying gently
    const c = this.camera, cab = this.cabin;
    const sw = CB.sway;
    const ex = CB.eye[0] + Math.sin(time * 0.071) * sw.pos + Math.sin(time * 0.163 + 1.2) * sw.pos * 0.4;
    const ey = CB.eye[1] + Math.sin(time * 0.057 + 2.1) * sw.pos + Math.sin(time * 0.131) * sw.pos * 0.3;
    const ez = CB.eye[2] + Math.sin(time * 0.043 + 0.7) * sw.pos * 0.6;
    cab.toWorld(ex, ey, ez, this._eye);
    cab.toWorld(CB.look[0], CB.look[1], CB.look[2], this._look);
    this._up.set(0, 1, 0).applyQuaternion(cab.win.quaternion);
    c.position.copy(this._eye);
    c.up.copy(this._up);
    c.lookAt(this._look);
    this._e.set(Math.sin(time * 0.09 + 0.4) * sw.rot * DEG, Math.sin(time * 0.067 + 1.9) * sw.rot * DEG, Math.sin(time * 0.051) * sw.rot * 0.6 * DEG);
    c.quaternion.multiply(this._q.setFromEuler(this._e));
    c.updateMatrixWorld();

    const ec = this.earth.camera;
    ec.quaternion.copy(c.quaternion);
    ec.position.set(0, 0, 0);
    ec.fov = c.fov; ec.aspect = c.aspect;
    ec.updateProjectionMatrix();
    ec.updateMatrixWorld();

    // ---- stream imagery for what the window can see
    if (this.tilesEnabled !== false) {
      const buf = this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2()));
      const pxPerRad = buf.y / (ec.fov * DEG);
      const axis = this._axis3 || (this._axis3 = new THREE.Vector3());
      ec.getWorldDirection(axis);
      const cone = this.cabin.scene.visible ? CB.tileCone : 60;
      this.earth.updateTiles(pxPerRad, axis, Math.cos(cone * DEG));
    }

    // look ahead along the ground track every couple of seconds
    if (this.tilesEnabled !== false && (this._ahead === undefined || time - this._ahead > 2)) {
      this._ahead = time;
      this.prefetch(t + 25);
    }

    // ---- is the sun disc visible through the window, and where on screen
    this.sunInView = this.sunVis * cab.sunThroughWindow(c.position, this.sunDir);
    this._p.copy(this.sunDir).multiplyScalar(1000).project(ec);
    this.sunScreen.set(this._p.x * 0.5 + 0.5, this._p.y * 0.5 + 0.5);
    this.sunInFront = this._p.z < 1;

    // ---- light in the cabin
    const local = cab.dirToLocal(this.sunDir, this._p);
    // how much of the beam makes it down the tunnel (0 when grazing the wall)
    const accept = clamp((-local.z - 0.35) / 0.4, 0, 1);
    const sunIn = this.sunVis * accept;
    // earthshine: bright when the ground below the window is in daylight
    const day = sstep(-2, 22, h);
    const earthCol = new THREE.Vector3(...CB.earthshineColor).multiplyScalar(day * CB.earthshine + (1 - day) * CB.nightEarthshine);
    const bounce = this.sunCol.clone().multiplyScalar(sunIn * CB.bounce);
    // indicator light: a slow heartbeat, or a flurry when the viewer returns
    let led = ((time % 3.2) < 0.08) ? 1 : 0.0;
    if (this.flickerT >= 0) {
      this.flickerT += dt;
      const f = this.flickerT;
      led = (Math.sin(f * 38) > 0 ? 1 : 0.05) * (1 - sstep(1.4, 2.0, f));
      if (f > 2.0) this.flickerT = -1;
    }
    this.led += (led - this.led) * Math.min(1, dt * 30);
    // direct sun: the wall's shadow decides where it lands; sunCol is already zero behind the planet
    cab.setLights({ sunDir: this.sunDir, sunCol: this.sunCol, sunVis: 1, earthCol, bounce, led: this.led });
    this.earth.limbMat.uniforms.uAirglow.value = 1 - sstep(-8, 0, h);
    this.updateLightning(t, dt, 1 - sstep(-4, 3, h));
  }
}
