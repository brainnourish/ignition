import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, sstep, rand } from './util.js';
import vert from './shaders/smoke.vert';
import frag from './shaders/smoke.frag';

const CS = CONFIG.smoke;
const CC = CONFIG.colors;

// Procedural smoke atlas, 4x4 cells in four families so no two neighbouring puffs look alike:
// row 0 billowing cauliflower, row 1 soft fbm, row 2 torn/wispy, row 3 dense lumpy cores.
function makeNoiseAtlas(size = CS.atlasSize) {
  const cells = 4, cell = size / cells;
  const data = new Uint8Array(size * size);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const h = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
    const u = fade(xf), v = fade(yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, y, oct, lac = 2.07, gain = 0.5, ridge = false) => {
    let n = 0, amp = 0.55, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      let v = vnoise(x * f, y * f);
      if (ridge) v = 1 - Math.abs(v * 2 - 1);
      n += amp * v; norm += amp; amp *= gain; f *= lac;
    }
    return n / norm;
  };
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    const ox = cx * 97.3 + cy * 13.1 + 11, oy = cy * 61.7 + cx * 7.9 + 5;
    const family = cy;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const nx = x / cell, ny = y / cell;
      const dx = nx - 0.5, dy = ny - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      // lumpy silhouette: the edge radius wanders with angle and noise
      const edgeN = vnoise(nx * 3.3 + ox + 40, ny * 3.3 + oy + 40);
      let a;
      if (family === 0) {
        // billows: overlapping round lobes (inverted cellular-ish look from ridged noise)
        const b = fbm(nx * 4.2 + ox, ny * 4.2 + oy, 5, 2.0, 0.55, true);
        const edge = 0.7 + 0.28 * (edgeN - 0.5) * 2;
        a = sstep(0.42, 0.78, b) * (1 - sstep(edge * 0.6, edge, r));
        a = Math.max(a, (1 - sstep(0.0, edge * 0.75, r)) * 0.55 * sstep(0.3, 0.7, b));
      } else if (family === 1) {
        const n = fbm(nx * 3.4 + ox, ny * 3.4 + oy, 5);
        const edge = 0.64 + 0.3 * (edgeN - 0.5) * 2;
        a = sstep(0.3, 0.8, n) * (1 - sstep(edge * 0.5, edge, r));
      } else if (family === 2) {
        // torn wisps: stretched noise, warped
        const wx = fbm(nx * 2 + ox + 3, ny * 2 + oy, 3) - 0.5;
        const n = fbm(nx * 2.2 + wx * 1.4 + ox, ny * 6.5 + oy, 5);
        const edge = 0.72 + 0.22 * (edgeN - 0.5) * 2;
        a = Math.pow(sstep(0.42, 0.86, n), 1.4) * (1 - sstep(edge * 0.45, edge, r));
      } else {
        const n = fbm(nx * 5.5 + ox, ny * 5.5 + oy, 5, 2.1, 0.58);
        const edge = 0.6 + 0.3 * (edgeN - 0.5) * 2;
        a = sstep(0.22, 0.62, n) * (1 - sstep(edge * 0.65, edge, r));
      }
      data[(cy * cell + y) * size + cx * cell + x] = clamp(Math.round(Math.pow(a, 1.1) * 255), 0, 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Coarse extinction grid over the pad. Particles splat into it every frame; each particle then
// marches toward the fire through it, so smoke shadows smoke.
class DensityGrid {
  constructor(g) {
    this.min = g.min; this.cell = g.cell;
    this.nx = Math.ceil((g.max[0] - g.min[0]) / g.cell);
    this.ny = Math.ceil((g.max[1] - g.min[1]) / g.cell);
    this.nz = Math.ceil((g.max[2] - g.min[2]) / g.cell);
    const n = this.nx * this.ny * this.nz;
    this.d = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.inv = 1 / g.cell;
  }
  clear() { this.d.fill(0); }
  // trilinear splat of `amount` (extinction x volume / cell volume)
  splat(x, y, z, amount) {
    const fx = (x - this.min[0]) * this.inv - 0.5, fy = (y - this.min[1]) * this.inv - 0.5, fz = (z - this.min[2]) * this.inv - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.nx - 1 || iy >= this.ny - 1 || iz >= this.nz - 1) return;
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const sx = this.nx, sxy = this.nx * this.ny;
    const b = ix + iy * sx + iz * sxy, d = this.d;
    const a0 = amount * (1 - tz), a1 = amount * tz;
    d[b] += a0 * (1 - tx) * (1 - ty); d[b + 1] += a0 * tx * (1 - ty);
    d[b + sx] += a0 * (1 - tx) * ty; d[b + sx + 1] += a0 * tx * ty;
    d[b + sxy] += a1 * (1 - tx) * (1 - ty); d[b + sxy + 1] += a1 * tx * (1 - ty);
    d[b + sxy + sx] += a1 * (1 - tx) * ty; d[b + sxy + sx + 1] += a1 * tx * ty;
  }
  // separable [1 2 1]/4 blur along each axis: spreads each splat over the particle's real extent
  blur() {
    const { nx, ny, nz } = this;
    const sx = 1, sy = nx, sz = nx * ny;
    const pass = (src, dst, stride, len, idxOf) => {
      for (let i = 0; i < src.length; i++) {
        const k = idxOf(i);
        const l = k > 0 ? src[i - stride] : src[i];
        const r = k < len - 1 ? src[i + stride] : src[i];
        dst[i] = (l + 2 * src[i] + r) * 0.25;
      }
    };
    pass(this.d, this.tmp, sx, nx, (i) => i % nx);
    pass(this.tmp, this.d, sy, ny, (i) => Math.floor(i / nx) % ny);
    pass(this.d, this.tmp, sz, nz, (i) => Math.floor(i / sz));
    const t = this.d; this.d = this.tmp; this.tmp = t;
  }
  sample(x, y, z) {
    const ix = ((x - this.min[0]) * this.inv) | 0, iy = ((y - this.min[1]) * this.inv) | 0, iz = ((z - this.min[2]) * this.inv) | 0;
    if (x < this.min[0] || y < this.min[1] || z < this.min[2] || ix >= this.nx || iy >= this.ny || iz >= this.nz) return 0;
    return this.d[ix + iy * this.nx + iz * this.nx * this.ny];
  }
  // optical depth from p toward q (stops `skip` units short of the particle itself)
  march(px, py, pz, qx, qy, qz, steps, skip) {
    let dx = qx - px, dy = qy - py, dz = qz - pz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-3) return 0;
    dx /= len; dy /= len; dz /= len;
    const start = Math.min(skip, len * 0.5);
    const span = Math.min(len - start, CS.grid.maxMarch);
    const st = span / steps;
    let od = 0;
    for (let s = 0; s < steps; s++) {
      const t = start + (s + 0.5) * st;
      od += this.sample(px + dx * t, py + dy * t, pz + dz * t);
    }
    return od * st;
  }
}

export class SmokeSystem {
  constructor(camera) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.max = CS.max;
    const n = this.max;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.rotv = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.lightR = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.buoy = new Float32Array(n);
    this.cell = new Float32Array(n);
    this.shade = new Float32Array(n);
    this.heat = new Float32Array(n);      // self-luminous glow carried by the particle
    this.alpha = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.count = 0;
    this.cursor = 0;
    this.emitScale = 1;
    this.grid = new DensityGrid(CS.grid);

    // per-particle lighting (smoothed so sort swaps and light changes never pop)
    this.pAmb = new Float32Array(n * 3);   // ambient + emission, not directional
    this.pDir = new Float32Array(n * 3);   // direct fire light after self-shadowing
    this.pL = new Float32Array(n * 3);     // dominant light direction (world)
    this.pBack = new Float32Array(n);
    this.smInit = new Uint8Array(n);
    this.order = new Int32Array(n);
    this.depth = new Float32Array(n);

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (name, sz) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * sz), sz); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a.array; };
    this.gOffset = mk('aOffset', 3);
    this.gSize = mk('aSize', 1);
    this.gRot = mk('aRot', 1);
    this.gAmb = mk('aAmb', 3);
    this.gDir = mk('aDirect', 3);
    this.gL = mk('aLightDir', 3);
    this.gAlpha = mk('aAlpha', 1);
    this.gCell = mk('aCell', 1);
    this.gShade = mk('aShade', 1);
    this.gBack = mk('aBacklit', 1);
    this.attrNames = ['aOffset', 'aSize', 'aRot', 'aAmb', 'aDirect', 'aLightDir', 'aAlpha', 'aCell', 'aShade', 'aBacklit'];
    geo.instanceCount = 0;
    this.geo = geo;

    this.uniforms = {
      tNoise: { value: makeNoiseAtlas() },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.5 },
      uFar: { value: 1000 },
      uHasDepth: { value: 0 },
      uBackCol: { value: new THREE.Vector3(...CC.smokeBacklit) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // light sources, set by the sequence each frame
    this.light = { pos: new THREE.Vector3(0, 1.5, 0), intensity: 0 };        // the engines
    this.trench = { pos: new THREE.Vector3(0, -1, 0), intensity: 0 };        // both trench exits
    this.exits = [new THREE.Vector3(...CS.exitPos), new THREE.Vector3(-CS.exitPos[0], CS.exitPos[1], CS.exitPos[2])];
    this._fwd = new THREE.Vector3();
    this.sortOrigin = new THREE.Vector3();
  }

  // Spawn one particle. Values are world units / seconds.
  spawn(o) {
    if (o.bulk !== true && Math.random() > this.emitScale) return -1;
    let i = -1;
    for (let k = 0; k < this.max; k++) {
      const idx = (this.cursor + k) % this.max;
      if (!this.alive[idx]) { i = idx; this.cursor = idx + 1; break; }
    }
    if (i < 0) return -1;
    this.alive[i] = 1;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.size[i] = o.size; this.size0[i] = o.size; this.grow[i] = o.grow || 0;
    this.rot[i] = rand(0, Math.PI * 2); this.rotv[i] = (o.rotv !== undefined ? o.rotv : rand(-0.35, 0.35));
    this.age[i] = 0; this.life[i] = o.life;
    this.alpha0[i] = o.alpha;
    const b = o.base || CC.smokeAlbedo;
    this.base[i * 3] = b[0]; this.base[i * 3 + 1] = b[1]; this.base[i * 3 + 2] = b[2];
    this.lightR[i] = o.lightR || CS.lightRadius;
    this.drag[i] = o.drag !== undefined ? o.drag : 0.9;
    this.buoy[i] = o.buoy || 0;
    this.cell[i] = o.cell !== undefined ? o.cell : Math.floor(Math.random() * 16);
    this.shade[i] = o.shade !== undefined ? o.shade : CS.shadeStrength;
    this.heat[i] = o.heat || 0;
    this.smInit[i] = 0;
    return i;
  }

  clearDynamic() {
    for (let i = 0; i < this.max; i++) if (this.alive[i] && this.life[i] < 1e5) this.alive[i] = 0;
  }

  update(dt) {
    const cam = this.camera;
    cam.getWorldDirection(this._fwd);
    const cp = cam.position;
    if (!this.sortOriginSet) this.sortOrigin.copy(cp);
    const L = this.light, T = this.trench, grid = this.grid;
    const fire = CC.fireLight, amb = CC.smokeAmbient, flood = CC.padFlood;
    const ex0 = this.exits[0], ex1 = this.exits[1];

    // ---- pass 1: motion, alpha, splat into the extinction grid
    grid.clear();
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) { this.alive[i] = 0; continue; }
      const i3 = i * 3;
      const drag = Math.pow(this.drag[i], dt * 2.5);
      this.vel[i3] *= drag; this.vel[i3 + 1] *= drag; this.vel[i3 + 2] *= drag;
      this.vel[i3 + 1] += this.buoy[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < -2.6 && life < 1e5) { this.pos[i3 + 1] = -2.6; this.vel[i3 + 1] = Math.abs(this.vel[i3 + 1]) * 0.3; }
      this.size[i] += this.grow[i] * dt * (1 / (1 + age * 0.15));
      this.rot[i] += this.rotv[i] * dt;
      const fadeIn = sstep(0, Math.min(0.5, life * 0.1), age);
      const fadeOut = 1 - sstep(life * 0.45, life, age);
      const thin = clamp((this.size0[i] * 1.8) / this.size[i], 0.3, 1);
      const alpha = this.alpha0[i] * fadeIn * fadeOut * thin;
      this.alpha[i] = alpha;
      if (life < 1e5) {
        // a sprite of width s behaves like a ball of radius ~0.35 s; extinction x volume / cell volume
        const r = this.size[i] * 0.35;
        const sigma = -Math.log(1 - Math.min(alpha * 0.92, 0.95)) / (2 * r);
        grid.splat(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2], sigma * 4.19 * r * r * r / (grid.cell * grid.cell * grid.cell));
      }
      this.order[n++] = i;
    }
    grid.blur();

    // ---- pass 2: lighting through the grid
    const lx = L.pos.x, ly = L.pos.y, lz = L.pos.z;
    const ex = lx - cp.x, ey = ly - cp.y, ez = lz - cp.z;
    const elen = Math.sqrt(ex * ex + ey * ey + ez * ez) + 1e-6;
    const k = CS.extinction, kms = CS.multiScatter;
    const smooth = Math.min(1, dt * 9);
    const steps = CS.grid.steps;
    // shadowed transmittance: single scattering term plus a softer multiple-scattering term
    const trans = (od) => Math.exp(-od * k) * (1 - kms) + Math.exp(-od * k * 0.25) * kms;
    for (let q = 0; q < n; q++) {
      const i = this.order[q], i3 = i * 3;
      const px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
      const R = this.lightR[i];
      const skip = this.size[i] * 0.3;
      const dyn = this.life[i] < 1e5;
      let wr = 0, wx = 0, wy = 0, wz = 0;   // light radiance, weighted direction
      // engines
      if (L.intensity > 0.001) {
        const dx = lx - px, dy = ly - py, dz = lz - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const t = dyn ? trans(grid.march(px, py, pz, lx, ly, lz, steps, skip)) : 1;
        const e = L.intensity * (R * R) / (d2 + 4) * t;
        const inv = e / Math.sqrt(d2 + 1e-4);
        wr += e; wx += dx * inv; wy += dy * inv; wz += dz * inv;
      }
      // flame leaving both ends of the trench
      if (T.intensity > 0.001) {
        for (const X of [ex0, ex1]) {
          const dx = X.x - px, dy = X.y - py, dz = X.z - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          const t = dyn ? trans(grid.march(px, py, pz, X.x, X.y, X.z, steps, skip)) : 1;
          const e = T.intensity * (R * R) / (d2 + 9) * t;
          const inv = e / Math.sqrt(d2 + 1e-4);
          wr += e; wx += dx * inv; wy += dy * inv; wz += dz * inv;
        }
      }
      wr = Math.min(wr, CS.maxLit);
      const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-6;
      // ambient: night sky from above (occluded by the smoke over it) + pad floodlights
      const occl = dyn ? Math.exp(-grid.march(px, py, pz, px, py + 60, pz, 3, skip) * k * 0.5) : 1;
      const dp2 = px * px + (py - 4) * (py - 4) + pz * pz;
      const fl = 0.35 / (1 + dp2 / 4000) * occl;
      const heat = this.heat[i] * Math.exp(-this.age[i] * 0.45);
      const ab = this.base;
      const aR = ab[i3] * (amb[0] * occl + flood[0] * fl) + fire[0] * heat * 0.6;
      const aG = ab[i3 + 1] * (amb[1] * occl + flood[1] * fl) + fire[1] * heat * 0.6;
      const aB = ab[i3 + 2] * (amb[2] * occl + flood[2] * fl) + fire[2] * heat * 0.6;
      const dR = ab[i3] * fire[0] * wr, dG = ab[i3 + 1] * fire[1] * wr, dB = ab[i3 + 2] * fire[2] * wr;
      // forward scattering: particles between the camera and the engines glow through their thin parts
      const vx = px - cp.x, vy = py - cp.y, vz = pz - cp.z;
      const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
      let back = 0;
      if (vlen < elen && L.intensity > 0.001) {
        const cosang = (vx * ex + vy * ey + vz * ez) / (vlen * elen);
        if (cosang > 0.85) {
          const c = (cosang - 0.85) / 0.15;
          const t = dyn ? trans(grid.march(px, py, pz, lx, ly, lz, 4, skip)) : 1;
          back = c * c * c * L.intensity * 1.4 * (R / 27) * t;
        }
      }
      if (!this.smInit[i]) {
        this.smInit[i] = 1;
        this.pAmb[i3] = aR; this.pAmb[i3 + 1] = aG; this.pAmb[i3 + 2] = aB;
        this.pDir[i3] = dR; this.pDir[i3 + 1] = dG; this.pDir[i3 + 2] = dB;
        this.pL[i3] = wx / wl; this.pL[i3 + 1] = wy / wl; this.pL[i3 + 2] = wz / wl;
        this.pBack[i] = back;
      } else {
        this.pAmb[i3] += (aR - this.pAmb[i3]) * smooth; this.pAmb[i3 + 1] += (aG - this.pAmb[i3 + 1]) * smooth; this.pAmb[i3 + 2] += (aB - this.pAmb[i3 + 2]) * smooth;
        this.pDir[i3] += (dR - this.pDir[i3]) * smooth; this.pDir[i3 + 1] += (dG - this.pDir[i3 + 1]) * smooth; this.pDir[i3 + 2] += (dB - this.pDir[i3 + 2]) * smooth;
        if (wr > 1e-4) {
          this.pL[i3] += (wx / wl - this.pL[i3]) * smooth; this.pL[i3 + 1] += (wy / wl - this.pL[i3 + 1]) * smooth; this.pL[i3 + 2] += (wz / wl - this.pL[i3 + 2]) * smooth;
        }
        this.pBack[i] += (Math.min(back, 4) - this.pBack[i]) * smooth;
      }
      // sort by distance from the (unshaken) camera position: rotation shake cannot reshuffle the order
      const sx = px - this.sortOrigin.x, sy = py - this.sortOrigin.y, sz = pz - this.sortOrigin.z;
      this.depth[i] = sx * sx + sy * sy + sz * sz;
    }

    // ---- far to near, into the GPU buffers
    const order = this.order.subarray(0, n);
    const depth = this.depth;
    if (!this.noSort) order.sort((a, b) => depth[b] - depth[a]);
    for (let q = 0; q < n; q++) {
      const i = order[q], i3 = i * 3, k3 = q * 3;
      this.gOffset[k3] = this.pos[i3]; this.gOffset[k3 + 1] = this.pos[i3 + 1]; this.gOffset[k3 + 2] = this.pos[i3 + 2];
      this.gSize[q] = this.size[i]; this.gRot[q] = this.rot[i];
      this.gAmb[k3] = this.pAmb[i3]; this.gAmb[k3 + 1] = this.pAmb[i3 + 1]; this.gAmb[k3 + 2] = this.pAmb[i3 + 2];
      this.gDir[k3] = this.pDir[i3]; this.gDir[k3 + 1] = this.pDir[i3 + 1]; this.gDir[k3 + 2] = this.pDir[i3 + 2];
      this.gL[k3] = this.pL[i3]; this.gL[k3 + 1] = this.pL[i3 + 1]; this.gL[k3 + 2] = this.pL[i3 + 2];
      this.gAlpha[q] = this.alpha[i]; this.gCell[q] = this.cell[i]; this.gShade[q] = this.shade[i]; this.gBack[q] = this.pBack[i];
    }
    for (const name of this.attrNames) {
      const a = this.geo.getAttribute(name);
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    this.count = n;
  }
}
