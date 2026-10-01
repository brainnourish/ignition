import * as THREE from 'three';

// Tileable 3D cloud noise, generated once on the CPU.
// R: Perlin-Worley (billowy base shape), G: Worley fbm (erosion detail for wispy edges).
export function makeCloudNoise(size = 64) {
  const N = size;
  const data = new Uint8Array(N * N * N * 2);
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // feature points for tileable Worley at a given cell count
  const worleyGrid = (cells) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < cells * cells * cells; i++) { pts[i * 3] = rnd(); pts[i * 3 + 1] = rnd(); pts[i * 3 + 2] = rnd(); }
    return { cells, pts };
  };
  const worley = (g, x, y, z) => {
    const c = g.cells;
    const fx = x * c, fy = y * c, fz = z * c;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz;
      const wx = ((cx % c) + c) % c, wy = ((cy % c) + c) % c, wz = ((cz % c) + c) % c;
      const k = (wx + wy * c + wz * c * c) * 3;
      const px = cx + g.pts[k] - fx, py = cy + g.pts[k + 1] - fy, pz = cz + g.pts[k + 2] - fz;
      const d = px * px + py * py + pz * pz;
      if (d < best) best = d;
    }
    return Math.min(1, Math.sqrt(best));
  };
  // tileable value noise: an integer hash of the wrapped lattice coordinate (any period)
  const period = 8;
  const L = (x, y, z, p) => {
    let h = ((((x % p) + p) % p) * 73856093) ^ ((((y % p) + p) % p) * 19349663) ^ ((((z % p) + p) % p) * 83492791);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967295;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const vnoise = (x, y, z, p) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const u = fade(x - ix), v = fade(y - iy), w = fade(z - iz);
    const a = (i, j, k) => L(ix + i, iy + j, iz + k, p);
    const x00 = a(0, 0, 0) + (a(1, 0, 0) - a(0, 0, 0)) * u, x10 = a(0, 1, 0) + (a(1, 1, 0) - a(0, 1, 0)) * u;
    const x01 = a(0, 0, 1) + (a(1, 0, 1) - a(0, 0, 1)) * u, x11 = a(0, 1, 1) + (a(1, 1, 1) - a(0, 1, 1)) * u;
    return (x00 + (x10 - x00) * v) + ((x01 + (x11 - x01) * v) - (x00 + (x10 - x00) * v)) * w;
  };
  const w1 = worleyGrid(4), w2 = worleyGrid(8), w3 = worleyGrid(16);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N, py = y / N, pz = z / N;
    const wf = (1 - worley(w1, px, py, pz)) * 0.625 + (1 - worley(w2, px, py, pz)) * 0.25 + (1 - worley(w3, px, py, pz)) * 0.125;
    let pn = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { pn += amp * vnoise(px * period * f, py * period * f, pz * period * f, period * f); norm += amp; amp *= 0.5; f *= 2; }
    pn /= norm;
    // Perlin-Worley: smooth noise with cellular billows pressed into it
    const pw = clamp01((pn - 0.5) * 1.6 + (wf - 0.5) * 1.1 + 0.5);
    const ww = (1 - worley(w2, px, py, pz)) * 0.55 + (1 - worley(w3, px, py, pz)) * 0.3 + (1 - worley(w1, px * 2 % 1, py * 2 % 1, pz * 2 % 1)) * 0.15;
    const i = (x + y * N + z * N * N) * 2;
    data[i] = Math.round(clamp01(pw) * 255);
    data[i + 1] = Math.round(clamp01(ww) * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
