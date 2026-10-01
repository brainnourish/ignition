import * as THREE from 'three';
import { CONFIG } from '../config.js';
import compositeVert from '../shaders/composite.vert';
import transFrag from '../shaders/orbit/transmittance.frag';
import msFrag from '../shaders/orbit/multiscatter.frag';
import earthVert from '../shaders/orbit/earth.vert';
import earthFrag from '../shaders/orbit/earth.frag';
import limbVert from '../shaders/orbit/limb.vert';
import limbFrag from '../shaders/orbit/limb.frag';
import spaceVert from '../shaders/orbit/space.vert';
import bakeVert from '../shaders/orbit/cloudbake.vert';
import bakeFrag from '../shaders/orbit/cloudbake.frag';
import spaceFrag from '../shaders/orbit/space.frag';
import starsVert from '../shaders/stars.vert';
import starsFrag from '../shaders/stars.frag';
import { makeCloudNoise } from './cloudnoise.js';
import { TiledEarth } from './tiles.js';

const E = CONFIG.earth;
const DEG = Math.PI / 180;

// geographic (deg) -> unit vector in the sphere's local frame (matches THREE.SphereGeometry + equirect uv)
export function geo(lat, lon) {
  const a = lat * DEG, b = lon * DEG;
  return new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(a), -Math.sin(b) * Math.cos(a));
}

// The planet, its air, the sun and the stars, in kilometres. The camera sits at the origin;
// +Y is local up at the spacecraft, -Z is the window's heading.
export class EarthScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, E.near, E.far);
    this.R = E.radius;
    this.center = new THREE.Vector3(0, -(E.radius + E.altitude), 0);
    this.sunDir = new THREE.Vector3(0, 0, -1);
    this.ready = false;

    // atmosphere LUTs, rendered once: transmittance, then multiple scattering (which reads it)
    const lutOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.lut = new THREE.WebGLRenderTarget(256, 64, lutOpts);
    this.msLut = new THREE.WebGLRenderTarget(32, 32, lutOpts);
    {
      const bake = (frag, target, uniforms = {}) => {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: compositeVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }));
        const s = new THREE.Scene(); s.add(q);
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(target);
        renderer.render(s, new THREE.Camera());
        renderer.setRenderTarget(prev);
        q.geometry.dispose(); q.material.dispose();
      };
      bake(transFrag, this.lut);
      bake(msFrag, this.msLut, { tTransmittance: { value: this.lut.texture } });
    }

    const shared = {
      tTransmittance: { value: this.lut.texture },
      tMultiScat: { value: this.msLut.texture },
      uSunDir: { value: this.sunDir },
      uSunE: { value: Math.PI },
      uCenter: { value: this.center },
    };
    this.shared = shared;

    // ---- space + sun
    this.spaceMat = new THREE.ShaderMaterial({
      vertexShader: spaceVert, fragmentShader: spaceFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { ...shared, uSunRadius: { value: E.sunRadius * DEG }, uSunRadiance: { value: E.sunRadiance } },
    });
    const space = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), this.spaceMat);
    space.frustumCulled = false;
    space.renderOrder = -2;
    this.scene.add(space);

    // ---- stars
    {
      const n = E.stars;
      const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.randomDirection().multiplyScalar(E.far * 0.8);
        pos.set([v.x, v.y, v.z], i * 3);
        size[i] = 0.55 + Math.pow(Math.random(), 4.0) * 2.2; phase[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      this.starMat = new THREE.ShaderMaterial({ vertexShader: starsVert, fragmentShader: starsFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uDim: { value: E.starBrightness } } });
      const stars = new THREE.Points(g, this.starMat);
      stars.frustumCulled = false;
      stars.renderOrder = -1;
      this.scene.add(stars);
    }

    // ---- limb (air against space); drawn before the planet, which overwrites it where it is solid
    this.limbMat = new THREE.ShaderMaterial({
      vertexShader: limbVert, fragmentShader: limbFrag, uniforms: { ...shared, uAirglow: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const limb = new THREE.Mesh(new THREE.SphereGeometry(6471, 384, 192), this.limbMat);
    limb.position.copy(this.center);
    limb.renderOrder = 0;
    limb.frustumCulled = false;
    this.scene.add(limb);

    // ---- the planet
    this.uniforms = {
      ...shared,
      tDay: { value: null }, tNight: { value: null }, tClouds: { value: null }, tBump: { value: null },
      uEarthRot: { value: new THREE.Matrix3() },
      uBumpTexel: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
      uBumpStrength: { value: E.bumpStrength },
      uCloudShift: { value: 0 },
      tNoise3: { value: makeCloudNoise(E.cloudNoiseSize) },
      uEarthRotT: { value: new THREE.Matrix3() },
      uCloudBase: { value: E.cloudBase },
      uCloudMax: { value: E.cloudMax },
      uCloudBaseline: { value: E.cloudBaseline },
      uPixelAngle: { value: 0.001 },
      tCloudCube: { value: null },
      uFlash: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uCityGain: { value: E.cityGain },
      uCityCol: { value: new THREE.Vector3(...E.cityColor) },
      uGlintRough: { value: E.glintRoughness },
      uSeaColor: { value: new THREE.Vector3(...E.seaColor) },
      uReliefExag: { value: E.reliefExaggeration },
      uNightGlow: { value: E.nightGlow },
    };
    // the global sphere: a low-resolution fallback just under the streamed tiles (poles, offline, loading)
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(E.radius - 1.0, 512, 256), new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: earthFrag, uniforms: this.uniforms }));
    this.earth.position.copy(this.center);
    this.earth.renderOrder = 2;   // after the tiles, so early depth rejects it wherever a tile is drawn
    this.scene.add(this.earth);
    // streamed imagery tiles (children of the planet, so they turn with it)
    const tileMat = new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: earthFrag, uniforms: this.uniforms, defines: { TILE: 1 } });
    this.tiles = new TiledEarth(this.earth, tileMat, renderer);

    this.storms = [0, 1, 2, 3].map(() => new THREE.Vector4());   // Earth-fixed dir, angular radius
    this.baseRot = this.orientation(E.startLat, E.startLon, E.heading);
    this.setTravel(0);
    this.loadTextures();
  }

  // local->world rotation that puts (lat, lon) straight below the camera, with the window heading
  // `heading` degrees clockwise from north pointing along -Z.
  orientation(lat, lon, heading) {
    const up = geo(lat, lon);
    const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
    const north = up.clone().cross(east).normalize();
    const h = north.clone().multiplyScalar(Math.cos(heading * DEG)).add(east.clone().multiplyScalar(Math.sin(heading * DEG)));
    const right = h.clone().cross(up).normalize();
    const back = h.clone().negate();
    // rows are the local basis vectors: maps local -> world (right->X, up->Y, back->Z)
    const m = new THREE.Matrix4().set(
      right.x, right.y, right.z, 0,
      up.x, up.y, up.z, 0,
      back.x, back.y, back.z, 0,
      0, 0, 0, 1,
    );
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  // orbital travel in km along the ground track (the track runs across the window, toward -X)
  setTravel(km) {
    const ang = km / (E.radius + E.altitude);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang).multiply(this.baseRot);
    this.earth.quaternion.copy(q);
    this.earth.updateMatrixWorld();
    this.uniforms.uEarthRot.value.setFromMatrix4(this.earth.matrixWorld);
    this.uniforms.uEarthRotT.value.copy(this.uniforms.uEarthRot.value).transpose();
  }

  loadTextures() {
    const loader = new THREE.TextureLoader();
    const load = (url, srgb) => new Promise((res) => loader.load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      t.wrapS = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
      res(t);
    }, undefined, () => res(null)));
    Promise.all([load('textures/earth_day.jpg', true), load('textures/earth_night.jpg', true), load('textures/earth_clouds.jpg', false), load('textures/earth_bump.jpg', false)]).then(([d, n, c, b]) => {
      const u = this.uniforms;
      u.tDay.value = d; u.tNight.value = n; u.tClouds.value = c; u.tBump.value = b;
      // upload now, during the quiet pad, so the cut to orbit never stalls
      for (const t of [d, n, c, b]) if (t) this.renderer.initTexture(t);
      // a CPU copy of the cloud coverage, so lightning can be placed inside real clouds
      if (c && c.image) {
        try {
          const w = 512, h = 256, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(c.image, 0, 0, w, h);
          this.coverage = { data: g.getImageData(0, 0, w, h).data, w, h };
        } catch (e) { this.coverage = null; }
      }
      this.bakeClouds(0);
      this.ready = true;
    });
  }

  // place thunderstorm clusters (Earth-fixed directions) and re-bake the cloud cube around them
  setStorms(list) {
    this.storms.forEach((v, i) => { const s = list[i]; if (s) v.set(s.dir.x, s.dir.y, s.dir.z, s.radius); else v.set(0, 1, 0, 0); });
    if (this.cloudCube) this.bakeClouds(this.bakedShift || 0);
  }

  // cloud coverage (0..1) at an Earth-fixed direction, from the CPU copy
  coverageAt(ld, shift = 0) {
    const C = this.coverage;
    if (!C) return 1;
    const u = ((Math.atan2(-ld.z, ld.x) / (2 * Math.PI) + 0.5 + shift) % 1 + 1) % 1;
    const v = Math.asin(Math.max(-1, Math.min(1, ld.y))) / Math.PI + 0.5;
    const x = Math.min(C.w - 1, Math.floor(u * C.w)), y = Math.min(C.h - 1, Math.floor((1 - v) * C.h));
    return C.data[(y * C.w + x) * 4] / 255;
  }

  // coverage + a conservative cloud-top bound, baked into a cube map (Earth-fixed directions) so the
  // cloud march tests each step with one fetch and no trigonometry. Re-baked as the clouds drift.
  bakeClouds(shift) {
    if (!this.cloudCube) {
      this.cloudCube = new THREE.WebGLCubeRenderTarget(E.cloudCubeSize, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.bakeMat = new THREE.ShaderMaterial({
        vertexShader: bakeVert, fragmentShader: bakeFrag, side: THREE.BackSide, depthTest: false, depthWrite: false,
        uniforms: { tClouds: this.uniforms.tClouds, tNoise3: this.uniforms.tNoise3, uCloudShift: { value: 0 }, uCloudBaseline: this.uniforms.uCloudBaseline, uStorm: { value: this.storms } },
      });
      this.bakeScene = new THREE.Scene();
      this.bakeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.bakeMat));
      this.cubeCam = new THREE.CubeCamera(0.1, 10, this.cloudCube);
      this.uniforms.tCloudCube.value = this.cloudCube.texture;
    }
    this.bakeMat.uniforms.uCloudShift.value = shift;
    const prev = this.renderer.getRenderTarget();
    this.cubeCam.update(this.renderer, this.bakeScene);
    this.renderer.setRenderTarget(prev);
    this.bakedShift = shift;
  }

  // stream tiles for the current view: pxPerRad = drawing-buffer pixels per radian, window cone as a cosine
  updateTiles(pxPerRad, windowAxis, windowCos, requestOnly = false) {
    this.earth.updateMatrixWorld();
    if (!requestOnly) this.uniforms.uPixelAngle.value = 1 / pxPerRad;
    this.tiles.update(this.camera, this.center, pxPerRad, windowAxis, windowCos, requestOnly);
  }

  update(time, pixelRatio, cloudShift) {
    this.starMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uPixelRatio.value = pixelRatio;
    this.uniforms.uCloudShift.value = cloudShift;
    if (this.cloudCube && Math.abs(cloudShift - this.bakedShift) > 2e-6) this.bakeClouds(cloudShift);
  }
}
