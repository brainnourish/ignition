import * as THREE from 'three';
import { CONFIG } from './config.js';
import vert from './shaders/wet.vert';
import frag from './shaders/wet.frag';

const W = CONFIG.wet;

// Planar reflection for the wet apron. Renders the launch scene *and* the smoke from a camera mirrored
// in the ground plane into a mipmapped target; the wet shader then samples it with ripple distortion
// and a roughness-dependent blur (sharp in puddles, smeared on damp concrete).
export class WetGround {
  constructor(scene, smoke) {
    this.scene = scene;
    this.smoke = smoke;
    this.y = W.height;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.mirror = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.uniforms = {
      tReflect: { value: this.rt.texture },
      uTexMatrix: { value: this.textureMatrix },
      uStrength: { value: W.strength },
      uTime: { value: 0 },
      uMaxLod: { value: 4 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W.size, W.size), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(W.center[0], this.y, W.center[1]);
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.enabled = true;
    this.scale = W.resolution;
    this._n = new THREE.Vector3(0, 1, 0);
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  setSize(w, h) {
    const rw = Math.max(1, Math.round(w * this.scale)), rh = Math.max(1, Math.round(h * this.scale));
    this.rt.setSize(rw, rh);
    this.uniforms.uMaxLod.value = Math.max(1, Math.floor(Math.log2(Math.min(rw, rh))) - 3);
  }

  render(renderer, camera, time) {
    this.mesh.visible = false;
    if (!this.enabled) return;
    this.uniforms.uTime.value = time;
    const cam = camera, m = this.mirror;
    // mirror position and view direction in the plane y = this.y
    this._p.setFromMatrixPosition(cam.matrixWorld);
    if (this._p.y <= this.y) return;
    m.position.set(this._p.x, 2 * this.y - this._p.y, this._p.z);
    cam.getWorldDirection(this._look);
    this._look.y = -this._look.y;
    this._t.copy(m.position).add(this._look);
    const up = this._look.clone().set(0, 1, 0).applyQuaternion(cam.quaternion);
    up.y = -up.y;
    m.up.copy(up);
    m.lookAt(this._t);
    m.fov = cam.fov; m.aspect = cam.aspect; m.near = cam.near; m.far = cam.far;
    m.updateMatrixWorld();
    m.updateProjectionMatrix();
    // texture matrix: world -> reflection uv
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    // oblique near plane so nothing below the ground leaks into the reflection
    this._plane.setFromNormalAndCoplanarPoint(this._n, this._t.set(0, this.y, 0)).applyMatrix4(m.matrixWorldInverse);
    this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = m.projectionMatrix, q = this._q;
    q.x = (Math.sign(this._clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(this._clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    this._clip.multiplyScalar(2.0 / this._clip.dot(q));
    pm.elements[2] = this._clip.x; pm.elements[6] = this._clip.y; pm.elements[10] = this._clip.z + 1.0; pm.elements[14] = this._clip.w;

    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(this.rt);
    renderer.autoClear = true;
    renderer.render(this.scene, m);
    // the smoke, without soft-particle depth (that depth belongs to the main camera)
    if (this.smoke && this.smoke.mesh.visible) {
      const u = this.smoke.uniforms.uHasDepth;
      const had = u.value;
      u.value = 0;
      renderer.autoClear = false;
      renderer.render(this.smoke.scene, m);
      u.value = had;
    }
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevRT);
    this.mesh.visible = true;
  }
}
