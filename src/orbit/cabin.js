import * as THREE from 'three';
import { CONFIG } from '../config.js';
import glassVert from '../shaders/orbit/glass.vert';
import glassFrag from '../shaders/orbit/glass.frag';

const CB = CONFIG.cabin;
const DEG = Math.PI / 180;

const sstep01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- procedural textures (canvas; generated once)
function valueNoise(seed = 1) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (a, b) => perm[(perm[a & 255] + b) & 255] / 255;
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const u = fade(x - xi), v = fade(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };
  return (x, y, oct = 4) => { let n = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < oct; o++) { n += amp * vn(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; } return n / norm; };
}

// woven fabric height: fine twill plus soft quilting pillows and a little grime variation
function fabricBump(size = 1024, quilt = 6) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const nz = valueNoise(3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const weave = 0.5 + 0.25 * Math.sin((x + y) * 1.6) * Math.sin((x - y) * 1.6);
    // quilting: pillows between stitched seams
    const qu = (u * quilt) % 1, qv = (v * quilt) % 1;
    const pillow = Math.sin(qu * Math.PI) * Math.sin(qv * Math.PI);
    const seam = Math.min(qu, 1 - qu, qv, 1 - qv) < 0.012 ? -0.35 : 0;
    const n = nz(u * 40, v * 40, 3);
    const val = 0.45 * Math.pow(pillow, 0.6) + 0.12 * weave + 0.15 * n + seam;
    const c = Math.max(0, Math.min(255, Math.round((val * 0.9 + 0.1) * 255)));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// fabric albedo variation (slight staining, darker near seams)
function fabricColor(size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const nz = valueNoise(11);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = nz(x / size * 6, y / size * 6, 5);
    const k = 0.82 + 0.3 * (n - 0.5);
    const i = (y * size + x) * 4;
    img.data[i] = 190 * k; img.data[i + 1] = 184 * k; img.data[i + 2] = 172 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// brushed / worn metal roughness
function metalRough(size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  const nz = valueNoise(7);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const brush = nz(x / size * 2, y / size * 160, 2);
    const wear = nz(x / size * 5, y / size * 5, 4);
    const r = 0.32 + 0.22 * brush + 0.25 * (wear - 0.5);
    const c = Math.max(0, Math.min(255, Math.round(r * 255)));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// glass smudges (r) and dust specks (g)
function smudgeTexture(size = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // wipe arcs (red channel)
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 14; k++) {
    const cx = size * (0.2 + rnd() * 0.6), cy = size * (0.2 + rnd() * 0.6), r = size * (0.12 + rnd() * 0.3);
    const a0 = rnd() * Math.PI * 2, a1 = a0 + 0.6 + rnd() * 1.6;
    g.strokeStyle = `rgba(${Math.floor(10 + rnd() * 22)},0,0,1)`;
    g.lineWidth = size * (0.02 + rnd() * 0.05);
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  }
  // fingerprint-ish blotches
  for (let k = 0; k < 4; k++) {
    const cx = size * (0.15 + rnd() * 0.7), cy = size * (0.15 + rnd() * 0.7), r = size * (0.02 + rnd() * 0.03);
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(${Math.floor(10 + rnd() * 12)},0,0,1)`); grad.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = grad; g.beginPath(); g.ellipse(cx, cy, r, r * 1.3, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // dust (green channel)
  for (let k = 0; k < 160; k++) {
    const x = rnd() * size, y = rnd() * size, r = 0.4 + Math.pow(rnd(), 5) * 1.6;
    g.fillStyle = `rgba(0,${Math.floor(30 + rnd() * 110)},0,1)`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- the cabin (metres). Local window frame: the window looks along -Z, the wall is the z = 0 plane.
export class Cabin {
  constructor() {
    this.scene = new THREE.Scene();
    this.win = new THREE.Group();
    this.scene.add(this.win);
    const W = this.win;
    const R = CB.holeRadius, D = CB.wallDepth;

    const fb = fabricBump(1024, 5);
    const fc = fabricColor();
    const mr = metalRough();
    const padMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, map: fc, bumpMap: fb, bumpScale: 0.6, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xa9a7a1, map: fc, bumpMap: fb, bumpScale: 1.2, roughness: 0.9, metalness: 0 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x5b5d61, roughness: 0.45, roughnessMap: mr, metalness: 0.85 });
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x7c7e82, roughness: 0.35, metalness: 0.9 });
    // window surrounds are dark (anodised / matte) to keep glare off the glass
    const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.62, roughnessMap: mr, metalness: 0.35 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x46505e, roughness: 0.5, metalness: 0.3 });
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.65, metalness: 0 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x8e8e8a, roughness: 0.75, roughnessMap: mr, metalness: 0.2 });
    fc.repeat.set(1.5, 1.5); fb.repeat.set(1.5, 1.5);
    const mats = [padMat, wallMat, metalMat, boltMat, tunnelMat, railMat, cableMat, panelMat];
    // every surface is solid from both sides: from some angles you look past the back of the lip or the
    // tunnel into the hollow behind the wall, and the planet must not show through there
    for (const m of mats) m.side = THREE.DoubleSide;
    this.mats = mats;

    const add = (mesh, cast = true, receive = true) => { mesh.castShadow = cast; mesh.receiveShadow = receive; W.add(mesh); return mesh; };

    // wall with the porthole cut out, a few cm of padding stood off it
    {
      const s = new THREE.Shape();
      s.moveTo(-2.5, -2); s.lineTo(2.5, -2); s.lineTo(2.5, 2); s.lineTo(-2.5, 2); s.lineTo(-2.5, -2);
      const hole = new THREE.Path(); hole.absarc(0, 0, CB.padOuter - 0.01, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const g = new THREE.ShapeGeometry(s, 64);
      // planar uv in metres
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 1.2, pos.getY(i) * 1.2);
      add(new THREE.Mesh(g, wallMat), true, true);
    }
    // the outer hull behind the wall: a closed backing with only the tunnel's opening in it
    {
      const s2 = new THREE.Shape();
      s2.moveTo(-3, -3); s2.lineTo(3, -3); s2.lineTo(3, 3); s2.lineTo(-3, 3); s2.lineTo(-3, -3);
      const hole2 = new THREE.Path(); hole2.absarc(0, 0, R * 0.965, 0, Math.PI * 2, true);
      s2.holes.push(hole2);
      const back = new THREE.Mesh(new THREE.ShapeGeometry(s2, 96), cableMat);
      back.position.z = -D;
      add(back, true, false);
    }
    // padded cushion ring around the opening (lathe profile in r, z)
    {
      const pts = [];
      const r0 = CB.flangeOuter - 0.004, r1 = CB.padOuter, th = CB.padThickness;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const r = r0 + (r1 - r0) * t;
        // soft cushion: rises quickly off the flange, rolls gently down into the wall
        const z = th * Math.pow(Math.sin(Math.PI * 0.5 * Math.min(1, t * 3.0)), 0.7) * (1 - sstep01(0.35, 1.0, t));
        pts.push(new THREE.Vector2(r, z));
      }
      const g = new THREE.LatheGeometry(pts, 128);
      g.rotateX(Math.PI / 2);   // lathe axis (y) -> window axis (z)
      add(new THREE.Mesh(g, padMat));   // rotateX maps the profile height onto +z: the bulge faces the cabin
      // one stitched seam where the cover meets the wall
      const seam = new THREE.Mesh(new THREE.TorusGeometry(r1 - 0.006, 0.0012, 6, 200), cableMat);
      seam.position.z = 0.002;
      add(seam, false, true);
    }
    // metal flange with bolts, and the tunnel through the hull
    {
      const flange = new THREE.Mesh(new THREE.RingGeometry(R - 0.003, CB.flangeOuter, 128, 1), metalMat);
      flange.position.z = 0.012;
      add(flange);
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.018, 128, 1, true), metalMat);
      lip.rotation.x = Math.PI / 2; lip.position.z = 0.003;
      add(lip);
      const boltGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 6);
      boltGeo.rotateX(Math.PI / 2);
      const n = CB.bolts;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.13;
        const b = new THREE.Mesh(boltGeo, boltMat);
        b.position.set(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0.015);
        b.rotation.z = a * 3.1;
        add(b);
      }
      const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, D, 128, 4, true), tunnelMat);
      tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -D / 2;
      add(tunnel);
      // retaining rings that hold each pane
      for (const z of [-CB.innerPane, -CB.outerPane]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, 0.006, 8, 128), metalMat);
        ring.position.z = z + 0.004;
        add(ring);
      }
    }
    // ledge below the window: a stowage box face with a lid
    {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.32), panelMat);
      box.position.set(0.05, CB.ledgeY - 0.06, 0.16);
      add(box);
      const lipB = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.012, 0.012), metalMat);
      lipB.position.set(0.05, CB.ledgeY + 0.004, 0.318);
      add(lipB);
      // two latches
      for (const x of [-0.3, 0.38]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.012), boltMat);
        l.position.set(x, CB.ledgeY - 0.03, 0.326);
        add(l);
      }
    }
    // handrail on the right
    {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.52, -0.32, 0.0), new THREE.Vector3(0.52, -0.30, 0.07), new THREE.Vector3(0.52, -0.2, 0.08),
        new THREE.Vector3(0.52, 0.2, 0.08), new THREE.Vector3(0.52, 0.3, 0.07), new THREE.Vector3(0.52, 0.32, 0.0),
      ]);
      add(new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.014, 12, false), railMat));
    }
    // cable run along the upper left, clipped to the wall
    {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.9, 0.46, 0.02), new THREE.Vector3(-0.5, 0.42, 0.03), new THREE.Vector3(-0.36, 0.3, 0.035),
        new THREE.Vector3(-0.42, 0.0, 0.03), new THREE.Vector3(-0.5, -0.4, 0.025), new THREE.Vector3(-0.55, -0.8, 0.02),
      ]);
      add(new THREE.Mesh(new THREE.TubeGeometry(path, 120, 0.008, 8, false), cableMat));
      const path2 = new THREE.CatmullRomCurve3(path.points.map((p) => p.clone().add(new THREE.Vector3(0.018, 0.004, 0.004))));
      add(new THREE.Mesh(new THREE.TubeGeometry(path2, 120, 0.006, 8, false), cableMat));
      for (const t of [0.25, 0.5, 0.75]) {
        const p = path.getPoint(t);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.02), railMat);
        clip.position.copy(p);
        add(clip);
      }
    }
    // indicator light: a small housing up and to the right of the window
    {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.018), panelMat);
      housing.position.set(...CB.ledPos).add(new THREE.Vector3(0.012, 0, -0.008));
      add(housing);
      this.ledMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), this.ledMat);
      led.position.set(...CB.ledPos);
      add(led, false, false);
      this.ledLight = new THREE.PointLight(0xffb040, 0, 0.6, 2);
      this.ledLight.position.set(...CB.ledPos).add(new THREE.Vector3(0, 0, 0.01));
      W.add(this.ledLight);
      this.ledWorld = new THREE.Vector3();
    }

    // ---------- glass
    this.smudge = smudgeTexture();
    this.glassUniforms = [];
    for (const [z, seed] of [[-CB.innerPane, 0.1], [-CB.outerPane, 0.63]]) {
      const u = {
        tSmudge: { value: this.smudge }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() },
        uEarthCol: { value: new THREE.Vector3() }, uInterior: { value: new THREE.Vector3() },
        uLedPos: { value: new THREE.Vector3() }, uLedCol: { value: new THREE.Vector3() }, uSeed: { value: seed },
      };
      const m = new THREE.Mesh(new THREE.CircleGeometry(R * 0.99, 96), new THREE.ShaderMaterial({
        vertexShader: glassVert, fragmentShader: glassFrag, uniforms: u, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.position.z = z;
      m.renderOrder = 5;
      W.add(m);
      this.glassUniforms.push(u);
    }

    // ---------- lights
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CB.shadowSize, CB.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -1.2; sc.right = 1.2; sc.top = 1.2; sc.bottom = -1.2; sc.near = 0.05; sc.far = 6;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.004;
    this.sun.shadow.radius = 1.5;
    this.scene.add(this.sun, this.sun.target);
    this.earthLight = new THREE.DirectionalLight(0x9fb8e0, 0);
    this.earthLight.castShadow = true;
    this.earthLight.shadow.mapSize.set(1024, 1024);
    const ec = this.earthLight.shadow.camera;
    ec.left = -1.2; ec.right = 1.2; ec.top = 1.2; ec.bottom = -1.2; ec.near = 0.05; ec.far = 6;
    this.earthLight.shadow.bias = -0.0005;
    this.earthLight.shadow.radius = 6;
    this.scene.add(this.earthLight, this.earthLight.target);
    // the cabin itself: very dim night lighting, and the bounce of any sunlight that got in
    this.fill = new THREE.HemisphereLight(0x8fa0c0, 0x2a2420, CB.nightFill);
    this.scene.add(this.fill);
    this.bounce = new THREE.PointLight(0xffe6c8, 0, 0, 2);
    this.scene.add(this.bounce);

    this.win.rotation.set(CB.pitch * DEG, 0, CB.roll * DEG, 'YXZ');
    this.win.updateMatrixWorld(true);
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  // window-local point -> world
  toWorld(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.win.matrixWorld); }
  // world direction -> window-local
  dirToLocal(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.win.quaternion.clone().invert()); }

  // is the sun disc visible through the hole from the eye? (0..1)
  sunThroughWindow(eyeWorld, sunDir) {
    const e = this._v.copy(eyeWorld).applyMatrix4(this.win.matrixWorld.clone().invert());
    const d = this.dirToLocal(sunDir, this._w);
    if (d.z > -0.05) return 0;
    const R = CB.holeRadius;
    let vis = 1;
    for (const z of [0, -CB.wallDepth]) {
      const t = (z - e.z) / d.z;
      const x = e.x + d.x * t, y = e.y + d.y * t;
      const r = Math.hypot(x, y);
      vis *= 1 - Math.min(1, Math.max(0, (r - (R - 0.006)) / 0.012));
    }
    return vis;
  }

  setLights({ sunDir, sunCol, sunVis, earthCol, bounce, led }) {
    const ctr = this.toWorld(0, 0, -CB.wallDepth * 0.5);
    this.sun.position.copy(sunDir).multiplyScalar(3).add(ctr);
    this.sun.target.position.copy(ctr);
    this.sun.color.setRGB(sunCol.x, sunCol.y, sunCol.z);
    this.sun.intensity = Math.PI * sunVis;
    this.sun.visible = sunVis > 1e-4;
    // earthshine arrives from below and ahead, through the window
    const down = this.toWorld(0, -0.9, -2.2).sub(ctr).normalize();
    this.earthLight.position.copy(down).multiplyScalar(3).add(ctr);
    this.earthLight.target.position.copy(ctr);
    this.earthLight.color.setRGB(earthCol.x, earthCol.y, earthCol.z);
    this.earthLight.intensity = 1;
    this.earthLight.visible = earthCol.x + earthCol.y + earthCol.z > 1e-4;
    // bounce from sunlight landing on the cabin behind the viewer
    this.bounce.position.copy(this.toWorld(0.3, 0.4, 1.6));
    this.bounce.color.setRGB(bounce.x, bounce.y, bounce.z);
    this.bounce.intensity = 1.6;
    this.fill.intensity = CB.nightFill;
    // indicator
    this.ledMat.color.setRGB(led * CB.ledGlow, led * CB.ledGlow * 0.55, led * CB.ledGlow * 0.14);
    this.ledLight.intensity = led * CB.ledLight;
    this.ledWorld.set(...CB.ledPos).applyMatrix4(this.win.matrixWorld);
    const interior = new THREE.Vector3(bounce.x, bounce.y, bounce.z).multiplyScalar(0.05).add(new THREE.Vector3(0.00006, 0.00006, 0.00008));
    for (const u of this.glassUniforms) {
      u.uSunDir.value.copy(sunDir);
      u.uSunCol.value.copy(sunCol).multiplyScalar(sunVis);
      u.uEarthCol.value.copy(earthCol);
      u.uInterior.value.copy(interior);
      u.uLedPos.value.copy(this.ledWorld);
      u.uLedCol.value.set(led * CB.ledGlow, led * CB.ledGlow * 0.55, led * CB.ledGlow * 0.14);
    }
  }
}
