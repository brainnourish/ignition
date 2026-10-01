import * as THREE from 'three';
import { CONFIG } from './config.js';
import skyVert from './shaders/sky.vert';
import skyFrag from './shaders/sky.frag';
import starsVert from './shaders/stars.vert';
import starsFrag from './shaders/stars.frag';

const C = CONFIG;

function silhouetteMaterial() {
  return new THREE.MeshStandardMaterial({ color: C.colors.silhouette, roughness: 0.58, metalness: 0.32 });
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function groundTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const img = g.createImageData(s, s);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const h = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
  const fade = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const u = fade(x - xi), v = fade(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const nx = x / s, ny = y / s;
    let n = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { n += amp * vn(nx * f, ny * f); amp *= 0.55; f *= 2; }
    const v = Math.pow(Math.min(Math.max(n * 1.15 - 0.15, 0), 1), 1.6);
    const i = (y * s + x) * 4;
    img.data[i] = 120 + v * 135; img.data[i + 1] = 110 + v * 130; img.data[i + 2] = 100 + v * 120; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(140, 140);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildScene(scene) {
  const S = {};
  const sil = silhouetteMaterial();

  // ---------- sky
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uHorizon: { value: new THREE.Vector3(...C.colors.skyHorizon) },
      uZenith: { value: new THREE.Vector3(...C.colors.skyZenith) },
      uGlowCol: { value: new THREE.Vector3(...C.colors.skyGlow) },
      uGlow: { value: 0 },
      uGlowDir: { value: new THREE.Vector3(0.2, 0, -1) },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(16000, 48, 32), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  S.sky = skyMat;

  // ---------- stars
  {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // hemisphere, biased away from the horizon
      const u = Math.random();
      const el = Math.asin(0.03 + 0.97 * Math.pow(u, 0.7));
      const az = Math.random() * Math.PI * 2;
      const r = 14000;
      pos[i * 3] = Math.cos(el) * Math.cos(az) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * r;
      const bright = Math.pow(Math.random(), 3.2);
      size[i] = 0.7 + bright * 2.2;
      phase[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: starsVert,
      fragmentShader: starsFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uDim: { value: 1 } },
    });
    const stars = new THREE.Points(g, m);
    stars.frustumCulled = false;
    scene.add(stars);
    S.stars = m;
  }

  // ---------- ground and pad
  const groundMat = new THREE.MeshStandardMaterial({ color: C.colors.ground, roughness: 1.0, metalness: 0.0, map: groundTexture() });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);

  const pad = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.9, metalness: 0.05 });
  const slabA = box(46, 3, 14, padMat); slabA.position.set(0, -1.5, 11);
  const slabB = box(46, 3, 14, padMat); slabB.position.set(0, -1.5, -11);
  const trenchFloor = box(46, 0.6, 8, padMat); trenchFloor.position.set(0, -6.3, 0);
  const wallA = box(46, 3.4, 0.5, padMat); wallA.position.set(0, -4.7, 4.25);
  const wallB = box(46, 3.4, 0.5, padMat); wallB.position.set(0, -4.7, -4.25);
  // hold-down ring the rocket sits on
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.8, 32, 1, true), padMat);
  ring.position.y = 0.2;
  pad.add(slabA, slabB, trenchFloor, wallA, wallB, ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const clamp = box(0.7, 1.6, 0.7, sil);
    clamp.position.set(Math.cos(a) * 3.1, 0.8, Math.sin(a) * 3.1);
    pad.add(clamp);
  }
  scene.add(pad);

  // low distant structures and lightning masts (silhouettes)
  for (const [mx, my, mz] of C.tower.masts) {
    const mast = box(0.9, C.tower.mastHeight, 0.9, sil);
    mast.position.set(mx, my + C.tower.mastHeight / 2 - 3, mz);
    scene.add(mast);
    const base = box(4, 6, 4, sil);
    base.position.set(mx, 0, mz);
    scene.add(base);
  }
  const bunker = box(22, 5, 12, sil); bunker.position.set(70, -0.5, -70); scene.add(bunker);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), sil); tank.position.set(-75, 4, -55); scene.add(tank);
  const tankBase = box(8, 6, 8, sil); tankBase.position.set(-75, 0, -55); scene.add(tankBase);

  // ---------- tower
  const T = C.tower;
  const tower = new THREE.Group();
  const hw = T.width / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const col = box(0.55, T.height, 0.55, sil);
    col.position.set(sx * hw, T.height / 2 - 3, sz * hw);
    tower.add(col);
  }
  for (let y = 2; y < T.height - 3; y += T.braceEvery) {
    for (const side of [0, 1]) {
      for (const s of [-1, 1]) {
        const b = side === 0 ? box(T.width, 0.22, 0.22, sil) : box(0.22, 0.22, T.width, sil);
        if (side === 0) b.position.set(0, y, s * hw); else b.position.set(s * hw, y, 0);
        tower.add(b);
        // diagonal
        const d = side === 0 ? box(T.width * 1.2, 0.16, 0.16, sil) : box(0.16, 0.16, T.width * 1.2, sil);
        d.position.set(side === 0 ? 0 : s * hw, y + T.braceEvery / 2, side === 0 ? s * hw : 0);
        if (side === 0) d.rotation.z = Math.atan2(T.braceEvery, T.width) * (s * ((Math.floor(y / T.braceEvery) % 2) ? 1 : -1));
        else d.rotation.x = Math.atan2(T.braceEvery, T.width) * (s * ((Math.floor(y / T.braceEvery) % 2) ? 1 : -1));
        tower.add(d);
      }
    }
  }
  const crane = box(9, 0.8, 0.8, sil); crane.position.set(3.5, T.height - 2.4, 0); tower.add(crane);
  const craneTop = box(0.6, 6, 0.6, sil); craneTop.position.set(0, T.height + 0.4, 0); tower.add(craneTop);
  // swing arms reaching the rocket
  const armLen = Math.abs(T.x) - hw - C.rocket.radius + 0.6;
  for (const ay of T.arms) {
    const arm = box(armLen, 0.9, 1.4, sil);
    arm.position.set(hw + armLen / 2, ay, T.z * 0.0 + 2);
    tower.add(arm);
  }
  // floodlight housings
  const flood = box(1.6, 0.6, 0.6, sil); flood.position.set(0, 6, hw + 0.5); tower.add(flood);
  tower.position.set(T.x, 0, T.z);
  scene.add(tower);

  // warning lights
  S.warnLights = [];
  const warnGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const warnPositions = [[-hw, T.height + 3, -hw], [hw, T.height + 3, hw], [-hw, T.height - 3, hw], [hw, T.height * 0.55, -hw], [-hw, T.height * 0.3, -hw]];
  for (const p of warnPositions) {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: true });
    const s = new THREE.Mesh(warnGeo, m);
    s.position.set(...p);
    tower.add(s);
    S.warnLights.push(m);
  }
  for (const [mx, , mz] of C.tower.masts) {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const s = new THREE.Mesh(warnGeo, m);
    s.position.set(mx, C.tower.mastHeight - 2.5, mz);
    scene.add(s);
    S.warnLights.push(m);
  }

  // ---------- rocket
  const R = C.rocket;
  const rocket = new THREE.Group();
  // the vehicle is painted (light albedo): dark only because it is night, it glows when the fire lights it
  const hull = new THREE.MeshStandardMaterial({ color: C.colors.hull, roughness: 0.62, metalness: 0.05 });
  const bodyH = R.bodyTop - R.bodyBottom;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R.radius, R.radius, bodyH, 48, 1), hull);
  body.position.y = R.bodyBottom + bodyH / 2;
  rocket.add(body);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.28, R.radius, R.noseHeight, 48, 1), hull);
  nose.position.y = R.bodyTop + R.noseHeight / 2;
  rocket.add(nose);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), hull);
  tip.position.y = R.bodyTop + R.noseHeight;
  rocket.add(tip);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R.radius + 0.25, R.radius + 0.35, 1.6, 48, 1), hull);
  skirt.position.y = R.bodyBottom + 0.8;
  rocket.add(skirt);
  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(R.radius + 0.06, R.radius + 0.06, 0.9, 48, 1), hull);
  interstage.position.y = R.bodyTop - 10;
  rocket.add(interstage);
  // raceway / conduit on the visible flank
  const raceway = box(0.35, bodyH - 2, 0.5, sil);
  raceway.position.set(R.radius * 0.72, R.bodyBottom + bodyH / 2, R.radius * 0.72);
  rocket.add(raceway);
  const ventPort = box(0.6, 0.4, 0.4, sil);
  ventPort.position.set(R.radius + 0.15, R.ventHeight, 0.3);
  rocket.add(ventPort);

  // engine bells
  S.bells = [];
  S.bellMats = [];
  const bellGeo = new THREE.CylinderGeometry(R.bellTopR, R.bellBottomR, R.bellHeight, 32, 1, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(a) * R.bellSpread, bz = Math.sin(a) * R.bellSpread;
    const bm = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.5, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 0, side: THREE.DoubleSide });
    const bell = new THREE.Mesh(bellGeo, bm);
    bell.position.set(bx, R.bodyBottom - R.bellHeight / 2 + 0.05, bz);
    rocket.add(bell);
    S.bells.push(new THREE.Vector3(bx, R.bodyBottom - R.bellHeight + 0.05, bz));
    S.bellMats.push(bm);
  }

  scene.add(rocket);
  S.rocket = rocket;

  // spent booster after separation: a small hot body that fades (HDR colour, bloom does the rest)
  const booster = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  booster.visible = false;
  scene.add(booster);
  S.booster = booster;

  // ---------- lights
  scene.add(new THREE.HemisphereLight(0x0e1218, 0x000000, C.light.hemi));
  const rim = new THREE.DirectionalLight(C.colors.rim, C.light.rim);
  rim.position.set(70, 30, -80);
  rim.target.position.set(0, 25, 0);
  scene.add(rim, rim.target);
  // faint pad floodlights
  const flood1 = new THREE.PointLight(0xffd8a8, 26, 0, 2);
  flood1.position.set(T.x, 6, T.z + hw + 1);
  scene.add(flood1);
  const flood2 = new THREE.PointLight(0xffd8a8, 16, 0, 2);
  flood2.position.set(14, 1.5, 16);
  scene.add(flood2);

  const engineLight = new THREE.PointLight(C.colors.engineLight, 0, 0, 2);
  engineLight.position.set(0, 2, 0);
  scene.add(engineLight);
  const trenchLight = new THREE.PointLight(C.colors.trenchLight, 0, 0, 2);
  trenchLight.position.set(0, 1.0, 0);
  scene.add(trenchLight);
  const bounceLight = new THREE.PointLight(C.colors.trenchLight, 0, 0, 2);
  bounceLight.position.set(0, 4, 26);
  scene.add(bounceLight);
  S.engineLight = engineLight;
  S.trenchLight = trenchLight;
  S.bounceLight = bounceLight;


  S.engineWorld = new THREE.Vector3(0, 1.5, 0);
  S.trenchWorld = new THREE.Vector3(0, -1, 0);
  return S;
}
