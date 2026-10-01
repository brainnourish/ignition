import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, sstep, wobble, expDecay } from './util.js';

const CC = CONFIG.camera;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.basePos = new THREE.Vector3(...CC.position);
    this.padTarget = new THREE.Vector3(...CC.padTarget);
    this.target = this.padTarget.clone();
    this.lookAt = this.padTarget.clone();
    this.shake = 0;          // current amplitude
    this.shakeTarget = 0;
    this.time = 0;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  // landscape: the vehicle sits in the left third with the words beside it; portrait: centred, words below
  setAspect(aspect) {
    const k = Math.min(1, Math.max(0, (aspect - 0.7) / 0.8));
    this.padTarget.x = CC.padTarget[0] * k + CC.portraitTargetX * (1 - k);
    this.padTarget.y = CC.padTarget[1] + CC.portraitLift * (1 - k);
  }

  reset() {
    this.target.copy(this.padTarget);
    this.lookAt.copy(this.padTarget);
    this.shake = this.shakeTarget = 0;
  }

  // rocketPos: world position of the rocket base; alt: altitude
  update(dt, rocketPos, alt, shakeAmp, follow = 1) {
    this.time += dt;
    this.shakeTarget = shakeAmp;
    this.shake = expDecay(this.shake, this.shakeTarget, 6, dt);

    const k = sstep(CC.trackStartAlt, CC.trackFullAlt, alt) * follow;
    // aim below the vehicle by a lead angle so the pad stays in the lower frame as long as possible
    const veh = rocketPos.clone().add(new THREE.Vector3(0, 20, 0));
    const rel = veh.clone().sub(this.basePos);
    const horiz = Math.hypot(rel.x, rel.z);
    const elev = Math.atan2(rel.y, horiz);
    const padRel = this.padTarget.clone().sub(this.basePos);
    const padElev = Math.atan2(padRel.y, Math.hypot(padRel.x, padRel.z));
    const aimElev = Math.max(padElev, elev - Math.min((elev - padElev) * 0.5, CC.leadAngle));
    const dist = rel.length();
    const az = Math.atan2(rel.x, rel.z);
    const aim = new THREE.Vector3(Math.sin(az) * Math.cos(aimElev) * dist, Math.sin(aimElev) * dist, Math.cos(az) * Math.cos(aimElev) * dist).add(this.basePos);
    this.target.lerpVectors(this.padTarget, aim, k);
    const lag = 1 - Math.exp(-dt * (follow < 1 ? 0.7 : CC.trackLag + k * 1.5));
    this.lookAt.lerp(this.target, lag);

    const cam = this.camera;
    const a = this.shake;
    const t = this.time * CC.shake.freq;
    cam.position.set(
      this.basePos.x + wobble(t * 0.9, 1.3) * a * CC.shake.posScale,
      this.basePos.y + wobble(t * 1.1, 7.1) * a * CC.shake.posScale * 0.8,
      this.basePos.z + wobble(t * 0.7, 3.9) * a * CC.shake.posScale * 0.5,
    );
    cam.lookAt(this.lookAt);
    // rotational jitter (the violent part)
    this._e.set(
      wobble(t * 1.3, 11.2) * a * CC.shake.rotScale,
      wobble(t * 1.15, 4.4) * a * CC.shake.rotScale,
      wobble(t * 0.95, 9.7) * a * CC.shake.rotScale * 0.6,
    );
    this._q.setFromEuler(this._e);
    cam.quaternion.multiply(this._q);
  }
}
