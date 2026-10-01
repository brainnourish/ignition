import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { CONFIG } from './config.js';
import compositeVert from './shaders/composite.vert';
import lumFrag from './shaders/lum_log.frag';
import reduceFrag from './shaders/lum_reduce.frag';
import adaptFrag from './shaders/lum_adapt.frag';

const AE = CONFIG.autoExposure;

// Measured eye adaptation, entirely on the GPU:
// HDR frame -> 64x64 centre-weighted log2 luminance -> 16 -> 4 -> 1 -> temporally adapted 1x1.
// The adapted value is read by the exposure shader as a texture, so nothing is read back to the CPU.
export class AutoExposurePass extends Pass {
  constructor() {
    super('AutoExposurePass');
    this.needsSwap = false;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.levels = [64, 16, 4, 1].map((s) => new THREE.WebGLRenderTarget(s, s, opts));
    this.adapt = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.ai = 0;
    this.valid = false;
    this.lumMat = new THREE.ShaderMaterial({ vertexShader: compositeVert, fragmentShader: lumFrag, uniforms: { tInput: { value: null }, uCenterWeight: { value: AE.centerWeight } }, depthTest: false, depthWrite: false });
    this.reduceMat = new THREE.ShaderMaterial({ vertexShader: compositeVert, fragmentShader: reduceFrag, uniforms: { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.adaptMat = new THREE.ShaderMaterial({
      vertexShader: compositeVert, fragmentShader: adaptFrag, depthTest: false, depthWrite: false,
      uniforms: { tTarget: { value: null }, tPrev: { value: null }, uDt: { value: 0 }, uUp: { value: AE.adaptUp }, uDown: { value: AE.adaptDown }, uReset: { value: 1 }, uHighlight: { value: AE.highlight } },
    });
    this.fullscreenMaterial = this.lumMat;
    this.dt = 1 / 60;
  }
  // the adapted log2 luminance, sampled by the exposure shader
  get texture() { return this.adapt[this.ai].texture; }
  reset() { this.valid = false; }
  render(renderer, inputBuffer) {
    this.lumMat.uniforms.tInput.value = inputBuffer.texture;
    this.fullscreenMaterial = this.lumMat;
    renderer.setRenderTarget(this.levels[0]);
    renderer.render(this.scene, this.camera);
    this.fullscreenMaterial = this.reduceMat;
    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1];
      this.reduceMat.uniforms.tInput.value = src.texture;
      this.reduceMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      renderer.setRenderTarget(this.levels[i]);
      renderer.render(this.scene, this.camera);
    }
    const prev = this.adapt[this.ai], next = this.adapt[1 - this.ai];
    const u = this.adaptMat.uniforms;
    u.tTarget.value = this.levels[this.levels.length - 1].texture;
    u.tPrev.value = prev.texture;
    u.uDt.value = this.dt;
    u.uReset.value = this.valid ? 0 : 1;
    this.fullscreenMaterial = this.adaptMat;
    renderer.setRenderTarget(next);
    renderer.render(this.scene, this.camera);
    this.ai = 1 - this.ai;
    this.valid = true;
  }
  // debug only: read the adapted and target log luminance back to the CPU
  read(renderer) {
    const a = new Uint16Array(4), t = new Uint16Array(4);
    renderer.readRenderTargetPixels(this.adapt[this.ai], 0, 0, 1, 1, a);
    renderer.readRenderTargetPixels(this.levels[3], 0, 0, 1, 1, t);
    const h = THREE.DataUtils.fromHalfFloat;
    const w = Math.max(h(t[1]), 1e-4);
    return { adapted: h(a[0]), logAvg: h(t[0]) / w, linMean: Math.log2(h(t[2]) / w + 1e-5) };
  }
}
