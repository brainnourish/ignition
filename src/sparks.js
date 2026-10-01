import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rand } from './util.js';
import vert from './shaders/sparks.vert';
import frag from './shaders/sparks.frag';
import lvert from './shaders/sparkline.vert';
import lfrag from './shaders/sparkline.frag';

const CS = CONFIG.sparks;

export class Sparks {
  constructor(scene) {
    const n = (this.max = CS.max);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.aLife = new Float32Array(n);
    this.aSize = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.aLife, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uPixelRatio: { value: 1 } };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.acc = 0;
    // motion streaks: a short line from each spark back along its velocity
    this.lpos = new Float32Array(n * 6);
    this.llife = new Float32Array(n * 2);
    this.lhead = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { this.lhead[i * 2] = 1; this.lhead[i * 2 + 1] = 0; }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3).setUsage(THREE.DynamicDrawUsage));
    lgeo.setAttribute('aLife', new THREE.BufferAttribute(this.llife, 1).setUsage(THREE.DynamicDrawUsage));
    lgeo.setAttribute('aHead', new THREE.BufferAttribute(this.lhead, 1));
    const lmat = new THREE.ShaderMaterial({ vertexShader: lvert, fragmentShader: lfrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(lgeo, lmat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.lgeo = lgeo;
  }

  // emit `count` sparks from the given world position, mostly downward
  emit(p, count, spread = 0.8) {
    for (let c = 0; c < count; c++) {
      let i = -1;
      for (let k = 0; k < this.max; k++) { const idx = (this.cursor + k) % this.max; if (!this.alive[idx]) { i = idx; this.cursor = idx + 1; break; } }
      if (i < 0) return;
      this.alive[i] = 1;
      const i3 = i * 3;
      this.pos[i3] = p.x + rand(-spread, spread); this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z + rand(-spread, spread);
      const a = rand(0, Math.PI * 2), s = rand(0.5, 5.5);
      this.vel[i3] = Math.cos(a) * s; this.vel[i3 + 1] = -rand(5, 16); this.vel[i3 + 2] = Math.sin(a) * s;
      this.life[i] = this.maxLife[i] = rand(0.35, 1.1);
      this.aSize[i] = rand(0.6, 1.5);
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) { this.aLife[i] = 0; this.llife[i * 2] = this.llife[i * 2 + 1] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0 || this.pos[i3 + 1] < -6) { this.alive[i] = 0; this.aLife[i] = 0; this.pos[i3 + 1] = -1000; this.lpos[i * 6 + 1] = -1000; this.lpos[i * 6 + 4] = -1000; continue; }
      this.vel[i3 + 1] -= CS.gravity * dt;
      this.vel[i3] *= 0.995; this.vel[i3 + 2] *= 0.995;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.aLife[i] = this.life[i] / this.maxLife[i];
      const i6 = i * 6, tail = 0.035;
      this.lpos[i6] = this.pos[i3]; this.lpos[i6 + 1] = this.pos[i3 + 1]; this.lpos[i6 + 2] = this.pos[i3 + 2];
      this.lpos[i6 + 3] = this.pos[i3] - this.vel[i3] * tail; this.lpos[i6 + 4] = this.pos[i3 + 1] - this.vel[i3 + 1] * tail; this.lpos[i6 + 5] = this.pos[i3 + 2] - this.vel[i3 + 2] * tail;
      this.llife[i * 2] = this.llife[i * 2 + 1] = this.aLife[i];
      any = true;
    }
    this.points.visible = any;
    this.lines.visible = any;
    this.lgeo.getAttribute('position').needsUpdate = true;
    this.lgeo.getAttribute('aLife').needsUpdate = true;
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aLife').needsUpdate = true;
    this.geo.getAttribute('aSize').needsUpdate = true;
  }
}
