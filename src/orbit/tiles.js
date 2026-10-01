import * as THREE from 'three';
import { CONFIG } from '../config.js';

const T = CONFIG.tiles;
const E = CONFIG.earth;
const PI = Math.PI;

// ---------- Web Mercator helpers (tile y grows southward)
const tileLon = (x, z) => (x / (1 << z)) * 360 - 180;
const tileLat = (y, z) => { const n = PI - (2 * PI * y) / (1 << z); return (180 / PI) * Math.atan(Math.sinh(n)); };
// geographic (deg) -> unit vector in the sphere's local frame (matches earth.js geo())
function geoVec(lat, lon, out) {
  const a = lat * PI / 180, b = lon * PI / 180;
  return out.set(Math.cos(b) * Math.cos(a), Math.sin(a), -Math.sin(b) * Math.cos(a));
}

// ---------- a streamed image layer (one XYZ source)
class Layer {
  constructor(name, url, maxZ, renderer, opts = {}) {
    this.name = name; this.url = url; this.maxZ = maxZ; this.renderer = renderer;
    this.srgb = opts.srgb !== false;
    this.decode = opts.decode || null;   // optional: ImageBitmap -> THREE.Texture (e.g. elevation)
    this.cache = new Map();   // key -> { tex, state: 'loading'|'ready'|'failed', used }
    this.queue = [];
    this.inflight = 0;
    this.maxInflight = opts.inflight || T.inflight;
  }
  key(z, x, y) { return `${z}/${x}/${y}`; }
  get(z, x, y) { return this.cache.get(this.key(z, x, y)); }
  // best available texture for (z, x, y): itself or the nearest loaded ancestor, with the uv transform
  best(z, x, y, frame) {
    let zz = Math.min(z, this.maxZ), dz = z - zz;
    let xx = x >> dz, yy = y >> dz;
    while (zz >= 0) {
      const e = this.cache.get(this.key(zz, xx, yy));
      if (e && e.state === 'ready') {
        e.used = frame;
        const s = 1 / (1 << (z - zz));
        return { tex: e.tex, scale: s, ox: (x - (xx << (z - zz))) * s, oy: (y - (yy << (z - zz))) * s };
      }
      zz--; xx >>= 1; yy >>= 1;
    }
    return null;
  }
  request(z, x, y, priority, frame) {
    if (z > this.maxZ) return;
    const k = this.key(z, x, y);
    const e = this.cache.get(k);
    if (e) {
      e.used = frame;
      if (e.state === 'queued') e.priority = Math.min(e.priority, priority);
      // transient server errors: try again later, backing off
      if (e.state === 'retry' && performance.now() > e.retryAt) { e.state = 'queued'; e.priority = priority; this.queue.push(e); }
      return;
    }
    const entry = { state: 'queued', priority, used: frame, z, x, y, tex: null, tries: 0 };
    this.cache.set(k, entry);
    this.queue.push(entry);
  }
  pump() {
    if (this.inflight >= this.maxInflight || !this.queue.length) return;
    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.inflight < this.maxInflight && this.queue.length) {
      const e = this.queue.shift();
      if (e.state !== 'queued') continue;
      e.state = 'loading';
      this.inflight++;
      const url = this.url(e.z, e.x, e.y);
      fetch(url, { mode: 'cors' })
        .then((r) => { if (!r.ok) { const err = new Error(r.status); err.status = r.status; throw err; } return r.blob(); })
        .then((b) => createImageBitmap(b, { imageOrientation: 'none', colorSpaceConversion: 'none' }))
        .then((bmp) => {
          if (this.decode) { e.tex = this.decode(bmp); bmp.close(); e.state = 'ready'; return; }
          const t = new THREE.Texture(bmp);
          t.flipY = false;
          t.colorSpace = this.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          t.needsUpdate = true;
          e.tex = t; e.state = 'ready';
        })
        .catch((err) => {
          // 404 means no data there (permanent); anything else is worth another try
          if (err && err.status === 404 || e.tries >= 4) { e.state = 'failed'; return; }
          e.tries++;
          e.state = 'retry';
          e.retryAt = performance.now() + 800 * Math.pow(2, e.tries);
        })
        .finally(() => { this.inflight--; });
    }
  }
  // drop textures not used for a while once over budget
  evict(frame, budget) {
    if (this.cache.size <= budget) return;
    const old = [...this.cache.values()].filter((e) => e.state === 'ready' && e.z > 3 && frame - e.used > 120).sort((a, b) => a.used - b.used);
    for (let i = 0; i < old.length && this.cache.size > budget; i++) {
      const e = old[i];
      if (e.tex) { if (e.tex.image && e.tex.image.close) e.tex.image.close(); e.tex.dispose(); }
      this.cache.delete(this.key(e.z, e.x, e.y));
    }
    // forget queued requests nobody wants any more
    this.queue = this.queue.filter((e) => { if (frame - e.used > 30) { this.cache.delete(this.key(e.z, e.x, e.y)); return false; } return true; });
  }
}

// Terrarium PNG (height = R*256 + G + B/256 - 32768 m) -> half-float height texture (km, sea floor clamped).
// Decoded on the CPU: filtering the packed RGB would carry across channels and corrupt the heights.
const _cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : null;
const _cx = _cv ? _cv.getContext('2d', { willReadFrequently: true }) : null;
function decodeTerrarium(bmp) {
  const w = bmp.width, h = bmp.height;
  if (_cv.width !== w || _cv.height !== h) { _cv.width = w; _cv.height = h; }
  _cx.drawImage(bmp, 0, 0);
  const px = _cx.getImageData(0, 0, w, h).data;
  const out = new Uint16Array(w * h);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const m = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
    out[i] = toHalf(Math.max(m, 0) / 1000);
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------- the streamed surface
export class TiledEarth {
  constructor(earthMesh, material, renderer) {
    this.earthMesh = earthMesh;         // the planet object: tiles are its children (they inherit its rotation)
    this.baseMaterial = material;       // compiled with TILE defined
    this.renderer = renderer;
    const gibs = (layer, lvl, ext, date = '') => (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}GoogleMapsCompatible_${lvl}/${z}/${y}/${x}.${ext}`;
    this.layers = {
      land: new Layer('land', gibs('Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual', 'Level12', 'jpeg', T.weldDate + '/'), T.landMaxZ, renderer),
      base: new Layer('base', gibs('BlueMarble_NextGeneration', 'Level8', 'jpeg'), 8, renderer),
      night: new Layer('night', gibs('VIIRS_Black_Marble', 'Level8', 'png', '2016-01-01/'), 8, renderer),
      // MODIS 250 m land/water mask: water opaque, land transparent (alpha is the water mask; includes lakes)
      mask: new Layer('mask', gibs('MODIS_Water_Mask', 'Level9', 'png'), 9, renderer, { srgb: false }),
      // AWS Terrain Tiles (open data), terrarium encoding
      height: new Layer('height', (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, T.heightMaxZ, renderer, { srgb: false, decode: decodeTerrarium, inflight: 8 }),
    };
    // coarse levels of the whole globe, fetched up front: there is always an ancestor to fall back on
    for (let z = 0; z <= 3; z++) for (let y = 0; y < (1 << z); y++) for (let x = 0; x < (1 << z); x++) {
      for (const l of [this.layers.base, this.layers.mask, this.layers.night]) l.request(z, x, y, -1, 0);
    }
    this.meshes = new Map();   // tile key -> mesh (geometry + material instance)
    this.group = new THREE.Group();
    earthMesh.add(this.group);
    this.frame = 0;
    this.visible = [];
    this.stats = { tiles: 0, maxZ: 0 };
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._cam = new THREE.Vector3();
    this._axis = new THREE.Vector3();
  }

  // keep downloads flowing while nothing is being drawn (the launch)
  pump() { for (const l of Object.values(this.layers)) l.pump(); }

  // tile patch geometry in the planet's local frame, relative to the tile centre (precision)
  geometry(z, x, y) {
    const seg = z <= 3 ? 48 : z <= 6 ? 24 : 16;
    const lon0 = tileLon(x, z), lon1 = tileLon(x + 1, z);
    const lat0 = tileLat(y, z), lat1 = tileLat(y + 1, z);   // north, south
    const R = E.radius;
    const center = geoVec((lat0 + lat1) / 2, (lon0 + lon1) / 2, new THREE.Vector3()).multiplyScalar(R);
    const pos = new Float32Array((seg + 1) * (seg + 1) * 3), uv = new Float32Array((seg + 1) * (seg + 1) * 2), nrm = new Float32Array((seg + 1) * (seg + 1) * 3);
    const my0 = y / (1 << z), my1 = (y + 1) / (1 << z);
    const v = new THREE.Vector3();
    let k = 0;
    for (let j = 0; j <= seg; j++) {
      // uniform in mercator y so the image maps exactly
      const my = my0 + (my1 - my0) * (j / seg);
      const lat = (180 / PI) * Math.atan(Math.sinh(PI - 2 * PI * my));
      for (let i = 0; i <= seg; i++) {
        const lon = lon0 + (lon1 - lon0) * (i / seg);
        geoVec(lat, lon, v);
        nrm[k * 3] = v.x; nrm[k * 3 + 1] = v.y; nrm[k * 3 + 2] = v.z;
        pos[k * 3] = v.x * R - center.x; pos[k * 3 + 1] = v.y * R - center.y; pos[k * 3 + 2] = v.z * R - center.z;
        uv[k * 2] = i / seg; uv[k * 2 + 1] = j / seg;
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return { g, center };
  }

  meshFor(z, x, y) {
    const k = `${z}/${x}/${y}`;
    let m = this.meshes.get(k);
    if (!m) {
      const { g, center } = this.geometry(z, x, y);
      const mat = this.baseMaterial.clone();
      // share every uniform with the planet except the per-tile textures and transforms
      mat.uniforms = { ...this.baseMaterial.uniforms,
        tLand: { value: null }, uLandXf: { value: new THREE.Vector4(1, 1, 0, 0) },
        tBase: { value: null }, uBaseXf: { value: new THREE.Vector4(1, 1, 0, 0) },
        tNightT: { value: null }, uNightXf: { value: new THREE.Vector4(1, 1, 0, 0) },
        uHasLand: { value: 0 },
        tMask: { value: null }, uMaskXf: { value: new THREE.Vector4(1, 1, 0, 0) }, uHasMask: { value: 0 },
        tHeight: { value: null }, uHeightXf: { value: new THREE.Vector4(1, 1, 0, 0) }, uHasHeight: { value: 0 },
        uHeightTexelKm: { value: 1 },   // km per height texel at the equator (times cos(lat) in the shader)
      };
      m = new THREE.Mesh(g, mat);
      m.position.copy(center);
      m.renderOrder = 1;
      m.frustumCulled = false;
      m.userData = { z, x, y, used: 0 };
      this.meshes.set(k, m);
    }
    m.userData.used = this.frame;
    return m;
  }

  // choose tiles: split while one texel would cover more than one screen pixel (T.texelPx)
  // requestOnly: prefetch for a view we will have soon (lower priority, nothing drawn)
  update(camera, earthCenter, pxPerRad, windowAxis, windowCos, requestOnly = false) {
    if (!requestOnly) this.frame++;
    const f = this.frame;
    // camera in the planet's local frame
    this._m.copy(this.earthMesh.matrixWorld).invert();
    const cam = this._cam.set(0, 0, 0).applyMatrix4(this._m);   // the camera sits at the world origin
    const axis = this._axis.copy(windowAxis).transformDirection(this._m);
    const R = E.radius;
    const camLen = cam.length();
    const horizonCos = R / camLen;   // cos of the angle (at the centre) to the horizon
    const out = [];
    const visit = (z, x, y) => {
      const lon0 = tileLon(x, z), lon1 = tileLon(x + 1, z), lat0 = tileLat(y, z), lat1 = tileLat(y + 1, z);
      // bounding cap: centre direction and angular radius
      const c = geoVec((lat0 + lat1) / 2, (lon0 + lon1) / 2, this._c);
      let rad = 0;
      for (const [la, lo] of [[lat0, lon0], [lat0, lon1], [lat1, lon0], [lat1, lon1], [lat0, (lon0 + lon1) / 2], [lat1, (lon0 + lon1) / 2]]) {
        rad = Math.max(rad, Math.acos(Math.min(1, geoVec(la, lo, this._v).dot(c))));
      }
      // horizon cull: the whole cap is beyond the horizon
      const camDir = this._w.copy(cam).normalize();
      const angToCam = Math.acos(Math.min(1, c.dot(camDir)));
      if (angToCam - rad > Math.acos(horizonCos) + 0.01) return;
      // window-cone cull: nearest point of the cap vs the porthole's view cone
      const nearest = this._v.copy(c).multiplyScalar(R);
      const toTile = nearest.sub(cam);
      const dist = toTile.length();
      const capKm = rad * R;
      const coneAng = Math.acos(Math.max(-1, Math.min(1, toTile.dot(axis) / dist)));
      if (coneAng - Math.atan2(capKm, dist) > Math.acos(windowCos) + 0.02) return;
      // texel size of this tile and its projected size at the nearest distance
      const latMid = Math.abs((lat0 + lat1) / 2) * PI / 180;
      const tileKm = (2 * PI * R * Math.cos(latMid)) / (1 << z);
      const texelKm = tileKm / 256;
      const nearDist = Math.max(dist - capKm, E.altitude * 0.9);
      const px = (texelKm / nearDist) * pxPerRad;
      if (px > T.texelPx && z < T.maxZ) {
        const z1 = z + 1, x1 = x * 2, y1 = y * 2;
        visit(z1, x1, y1); visit(z1, x1 + 1, y1); visit(z1, x1, y1 + 1); visit(z1, x1 + 1, y1 + 1);
        return;
      }
      out.push({ z, x, y, px, dist: nearDist });
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) visit(2, x, y);

    // requests (nearest first), and the per-tile texture bindings
    const L = this.layers;
    if (requestOnly) {
      for (const t of out) {
        const pr = 1 + t.dist / 1000;
        const c8 = (l, zm) => l.request(Math.min(t.z, zm), t.x >> Math.max(0, t.z - zm), t.y >> Math.max(0, t.z - zm), pr, f);
        L.land.request(t.z, t.x, t.y, pr, f); c8(L.base, 8); c8(L.night, 8); c8(L.mask, 9); c8(L.height, T.heightMaxZ);
      }
      for (const l of Object.values(L)) l.pump();
      return;
    }
    this.group.clear();
    let maxZ = 0, maxPx = 0, maxBasePx = 0, maxNightPx = 0;
    for (const t of out) {
      const pr = t.dist / 1000 + (8 - Math.min(t.z, 8)) * 0.01;
      L.land.request(t.z, t.x, t.y, pr, f);
      L.base.request(Math.min(t.z, 8), t.x >> Math.max(0, t.z - 8), t.y >> Math.max(0, t.z - 8), pr, f);
      L.night.request(Math.min(t.z, 8), t.x >> Math.max(0, t.z - 8), t.y >> Math.max(0, t.z - 8), pr, f);
      L.mask.request(Math.min(t.z, 9), t.x >> Math.max(0, t.z - 9), t.y >> Math.max(0, t.z - 9), pr - 0.5, f);   // the mask gates the land imagery: fetch it first
      if (t.z >= 5) { const hz = Math.min(t.z, T.heightMaxZ); L.height.request(hz, t.x >> (t.z - hz), t.y >> (t.z - hz), pr + 0.2, f); }
      const m = this.meshFor(t.z, t.x, t.y);
      const u = m.material.uniforms;
      const bind = (layer, tu, xu, flag) => {
        const b = layer.best(t.z, t.x, t.y, f);
        u[tu].value = b ? b.tex : null;
        if (b) u[xu].value.set(b.scale, b.scale, b.ox, b.oy);
        if (flag) u[flag].value = b ? 1 : 0;
        return b;
      };
      bind(L.land, 'tLand', 'uLandXf', 'uHasLand');
      const bb = bind(L.base, 'tBase', 'uBaseXf');
      bind(L.night, 'tNightT', 'uNightXf');
      bind(L.mask, 'tMask', 'uMaskXf', 'uHasMask');
      const hb = t.z >= 5 ? bind(L.height, 'tHeight', 'uHeightXf', 'uHasHeight') : (u.uHasHeight.value = 0, null);
      if (hb) u.uHeightTexelKm.value = (2 * PI * E.radius) / ((1 << t.z) * 256) / hb.scale;
      if (!bb) continue;   // nothing to draw yet: the global sphere underneath shows through
      this.group.add(m);
      maxZ = Math.max(maxZ, t.z);
      // projected texel size of what is actually bound (an ancestor texture is magnified by 2^levels)
      const lb = L.land.best(t.z, t.x, t.y, f);
      if (lb) maxPx = Math.max(maxPx, t.px / lb.scale);
      maxBasePx = Math.max(maxBasePx, t.px / bb.scale);
      const nb = L.night.best(t.z, t.x, t.y, f);
      if (nb) maxNightPx = Math.max(maxNightPx, t.px / nb.scale);
    }
    for (const l of Object.values(L)) { l.pump(); l.evict(f, T.cacheBudget); }
    // free tile meshes nobody drew for a while
    if (f % 60 === 0) for (const [k, m] of this.meshes) if (f - m.userData.used > 300) { m.geometry.dispose(); m.material.dispose(); this.meshes.delete(k); }
    this.stats = { tiles: this.group.children.length, selected: out.length, maxZ, maxTexelPx: maxPx, maxBasePx, maxNightPx };
  }
}
