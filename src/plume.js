import * as THREE from 'three';
import { CONFIG } from './config.js';
import vert from './shaders/plume.vert';
import frag from './shaders/plume.frag';

const C = CONFIG.colors;

// A cylindrical-billboard exhaust column rendered with a shader.
export class Plume {
  constructor(scene, seed = Math.random()) {
    this.uniforms = {
      uOrigin: { value: new THREE.Vector3() },
      uAxis: { value: new THREE.Vector3(0, -1, 0) },
      uLen: { value: 10 },
      uWidth: { value: 1 },
      uTime: { value: 0 },
      uPower: { value: 0 },
      uSeed: { value: seed },
      uExpand: { value: 1 },
      uFall: { value: 1.6 },
      uBright: { value: 1 },
      uIntensity: { value: CONFIG.plume.intensity },
      uDiamonds: { value: 5 },
      uCoreLen: { value: 0.75 },
      uCoreCol: { value: new THREE.Vector3(...C.plumeCore) },
      uBodyCol: { value: new THREE.Vector3(...C.plumeBody) },
      uEdgeCol: { value: new THREE.Vector3(...C.plumeEdge) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1, 1, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  set({ origin, axis, len, width, power, expand, fall, bright, diamonds, coreLen }) {
    const u = this.uniforms;
    if (origin) u.uOrigin.value.copy(origin);
    if (axis) u.uAxis.value.copy(axis);
    if (len !== undefined) u.uLen.value = len;
    if (width !== undefined) u.uWidth.value = width;
    if (power !== undefined) u.uPower.value = power;
    if (expand !== undefined) u.uExpand.value = expand;
    if (fall !== undefined) u.uFall.value = fall;
    if (bright !== undefined) u.uBright.value = bright;
    if (diamonds !== undefined) u.uDiamonds.value = diamonds;
    if (coreLen !== undefined) u.uCoreLen.value = coreLen;
    this.mesh.visible = u.uPower.value > 0.002;
  }

  update(time) {
    this.uniforms.uTime.value = time;
  }
}
