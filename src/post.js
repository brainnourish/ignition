import * as THREE from 'three';
import {
  EffectComposer, EffectPass, Pass, Effect, BloomEffect, ChromaticAberrationEffect,
  NoiseEffect, VignetteEffect, ToneMappingEffect, ToneMappingMode, BlendFunction, KernelSize,
} from 'postprocessing';
import { CONFIG } from './config.js';
import heatFrag from './shaders/heat.frag';
import anamorphicFrag from './shaders/anamorphic.frag';
import motionBlurFrag from './shaders/motionblur.frag';
import compositeVert from './shaders/composite.vert';
import compositeFrag from './shaders/composite.frag';
import streakDownFrag from './shaders/streak_down.frag';
import streakBlurFrag from './shaders/streak_blur.frag';
import temporalFrag from './shaders/temporal.frag';
import flareFrag from './shaders/flare.frag';
import { AutoExposurePass } from './exposure.js';

const CB = CONFIG.bloom, CP = CONFIG.post, AE = CONFIG.autoExposure;

class HeatFlashEffect extends Effect {
  constructor() {
    super('HeatFlashEffect', heatFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['uHeatPos', new THREE.Uniform(new THREE.Vector2(0.5, 0.3))],
        ['uHeatSize', new THREE.Uniform(new THREE.Vector2(0.12, 0.3))],
        ['uHeatStrength', new THREE.Uniform(0)],
        ['uFlash', new THREE.Uniform(0)],
        ['uFlashCol', new THREE.Uniform(new THREE.Vector3(...CONFIG.colors.flash))],
        ['tAdapt', new THREE.Uniform(null)],
        ['uBase', new THREE.Uniform(AE.launch.base)],
        ['uRef', new THREE.Uniform(AE.launch.ref)],
        ['uStrength', new THREE.Uniform(AE.launch.strength)],
        ['uMaxDrop', new THREE.Uniform(AE.launch.maxDrop)],
        ['uCompensation', new THREE.Uniform(1)],
        ['uCeiling', new THREE.Uniform(AE.launch.ceiling)],
      ]),
    });
  }
}

// Horizontal lens streak: threshold + downsample to 1/4 res, then three widening horizontal blurs.
class StreakPass extends Pass {
  constructor() {
    super('StreakPass');
    this.needsSwap = false;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.downMat = new THREE.ShaderMaterial({ vertexShader: compositeVert, fragmentShader: streakDownFrag, uniforms: { tInput: { value: null }, uThreshold: { value: CP.anamorphicThreshold } }, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ vertexShader: compositeVert, fragmentShader: streakBlurFrag, uniforms: { tInput: { value: null }, uStep: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.fullscreenMaterial = this.downMat;
    this.w = 1;
  }
  get texture() { return this.rtB.texture; }
  setSize(w, h) {
    this.w = Math.max(1, Math.ceil(w / 4));
    const hh = Math.max(1, Math.ceil(h / 4));
    this.rtA.setSize(this.w, hh);
    this.rtB.setSize(this.w, hh);
  }
  render(renderer, inputBuffer) {
    const px = 1 / this.w;
    this.downMat.uniforms.tInput.value = inputBuffer.texture;
    this.fullscreenMaterial = this.downMat;
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.scene, this.camera);
    this.fullscreenMaterial = this.blurMat;
    const passes = [[this.rtA, this.rtB, 1], [this.rtB, this.rtA, 2], [this.rtA, this.rtB, 5]];
    for (const [src, dst, stride] of passes) {
      this.blurMat.uniforms.tInput.value = src.texture;
      this.blurMat.uniforms.uStep.value.set(px * stride, 0);
      renderer.setRenderTarget(dst);
      renderer.render(this.scene, this.camera);
    }
  }
}

class AnamorphicEffect extends Effect {
  constructor(streakTexture) {
    super('AnamorphicEffect', anamorphicFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['tStreak', new THREE.Uniform(streakTexture)],
        ['uStrength', new THREE.Uniform(CP.anamorphic)],
        ['uTint', new THREE.Uniform(new THREE.Vector3(1.0, 0.6, 0.35))],
      ]),
    });
  }
}

class FlareEffect extends Effect {
  constructor() {
    super('FlareEffect', flareFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['uSun', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uStrength', new THREE.Uniform(0)],
        ['uTint', new THREE.Uniform(new THREE.Vector3(1, 0.95, 0.9))],
      ]),
    });
  }
}

// Renders one or more [scene, camera] layers into the same HDR buffer; depth is cleared between
// layers, so the cabin (metres) sits over the planet (kilometres) without sharing a depth range.
class LayerRenderPass extends Pass {
  constructor(layers) {
    super('LayerRenderPass');
    this.layers = layers;
    this.needsSwap = false;
    // the composer copies the scene depth (for soft smoke) only after passes that ask for it
    this.needsDepthBlit = true;
  }
  render(renderer, inputBuffer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.clear(true, true, false);
    for (let i = 0; i < this.layers.length; i++) {
      if (i > 0) renderer.clearDepth();
      renderer.render(this.layers[i][0], this.layers[i][1]);
    }
    renderer.autoClear = auto;
  }
}

class MotionBlurEffect extends Effect {
  constructor() {
    super('MotionBlurEffect', motionBlurFrag, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['uPrevVP', new THREE.Uniform(new THREE.Matrix4())],
        ['uInvVP', new THREE.Uniform(new THREE.Matrix4())],
        ['uStrength', new THREE.Uniform(0)],
      ]),
    });
  }
}

// Renders the smoke into a half-resolution HDR buffer (soft against scene depth) and composites it.
class SmokePass extends Pass {
  constructor(smoke, camera) {
    super('SmokePass');
    this.smoke = smoke;
    this.viewCamera = camera;
    this.needsDepthTexture = true;
    this.needsSwap = true;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(1, 1, opts);
    // two history buffers: a short temporal blend hides depth-sort swaps between overlapping sprites
    this.hist = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.histIndex = 0;
    this.histValid = false;
    this.temporalMat = new THREE.ShaderMaterial({
      vertexShader: compositeVert, fragmentShader: temporalFrag,
      uniforms: { tCur: { value: this.rt.texture }, tPrev: { value: null }, uBlend: { value: CONFIG.smoke.temporalBlend } },
      depthTest: false, depthWrite: false,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: compositeVert, fragmentShader: compositeFrag,
      uniforms: { tScene: { value: null }, tSmoke: { value: null } },
      depthTest: false, depthWrite: false,
    });
    this.fullscreenMaterial = this.compositeMat;
    this._clear = new THREE.Color();
  }
  setDepthTexture(depthTexture) {
    this.smoke.uniforms.tDepth.value = depthTexture;
    this.smoke.uniforms.uHasDepth.value = depthTexture ? 1 : 0;
  }
  setSize(w, h) {
    const hw = Math.max(1, Math.ceil(w * 0.5)), hh = Math.max(1, Math.ceil(h * 0.5));
    this.rt.setSize(hw, hh);
    this.hist[0].setSize(hw, hh);
    this.hist[1].setSize(hw, hh);
    this.histValid = false;
    this.smoke.uniforms.uResolution.value.set(hw, hh);
  }
  render(renderer, inputBuffer, outputBuffer) {
    const cam = this.viewCamera;
    this.smoke.uniforms.uNear.value = cam.near;
    this.smoke.uniforms.uFar.value = cam.far;
    renderer.getClearColor(this._clear);
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.smoke.scene, cam);
    renderer.setClearColor(this._clear, alpha);
    // temporal blend into the history buffer
    const prev = this.hist[this.histIndex], next = this.hist[1 - this.histIndex];
    this.temporalMat.uniforms.tPrev.value = prev.texture;
    this.temporalMat.uniforms.uBlend.value = this.histValid ? CONFIG.smoke.temporalBlend : 1.0;
    this.fullscreenMaterial = this.temporalMat;
    renderer.setRenderTarget(next);
    renderer.render(this.scene, this.camera);
    this.histIndex = 1 - this.histIndex;
    this.histValid = true;
    // composite over the scene
    this.compositeMat.uniforms.tScene.value = inputBuffer.texture;
    this.compositeMat.uniforms.tSmoke.value = next.texture;
    this.fullscreenMaterial = this.compositeMat;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }
}

export function setupPost(renderer, scene, camera, smoke) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  const renderPass = new LayerRenderPass([[scene, camera]]);
  composer.addPass(renderPass);
  const smokePass = new SmokePass(smoke, camera);
  composer.addPass(smokePass);
  const autoExposure = new AutoExposurePass();
  composer.addPass(autoExposure);

  const motion = new MotionBlurEffect();
  const heat = new HeatFlashEffect();
  const bloom = new BloomEffect({
    intensity: CB.intensity, luminanceThreshold: CB.threshold, luminanceSmoothing: CB.smoothing,
    mipmapBlur: true, radius: CB.radius, levels: 8, kernelSize: KernelSize.LARGE,
  });
  const streak = new StreakPass();
  const anamorphic = new AnamorphicEffect(streak.texture);
  const flare = new FlareEffect();
  const aberration = new ChromaticAberrationEffect({ offset: new THREE.Vector2(CP.aberration, CP.aberration * 0.6), radialModulation: true, modulationOffset: CP.aberrationEdgeStart });
  const vignette = new VignetteEffect({ offset: CP.vignetteOffset, darkness: CP.vignetteDarkness });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
  noise.blendMode.opacity.value = CP.grain;

  composer.addPass(new EffectPass(camera, motion, heat));
  composer.addPass(new EffectPass(camera, bloom));
  composer.addPass(streak);
  composer.addPass(new EffectPass(camera, anamorphic, flare, aberration, vignette, tone, noise));

  const u = heat.uniforms;
  u.get('tAdapt').value = autoExposure.texture;
  const prevVP = new THREE.Matrix4();
  const curVP = new THREE.Matrix4();
  let first = true;
  return {
    composer, effects: { autoExposure, motion, heat, bloom, anamorphic, flare, aberration, vignette, tone, noise, streak },
    setFlash(v) { u.get('uFlash').value = v; },
    // exposure compensation on top of the metered exposure (1 = neutral)
    setExposure(v) { u.get('uCompensation').value = v; },
    // metering profile: { base, ref, strength, maxDrop } (see config.autoExposure)
    setMetering(m) { u.get('uBase').value = m.base; u.get('uRef').value = m.ref; u.get('uStrength').value = m.strength; u.get('uMaxDrop').value = m.maxDrop; u.get('uCeiling').value = m.ceiling; autoExposure.adaptMat.uniforms.uHighlight.value = m.highlight; },
    resetExposure() { autoExposure.reset(); },
    readExposure() { return autoExposure.read(renderer); },
    setHeat(x, y, w, h, strength) {
      u.get('uHeatPos').value.set(x, y);
      u.get('uHeatSize').value.set(w, h);
      u.get('uHeatStrength').value = strength;
    },
    setBloom(intensity, radius, threshold) {
      bloom.intensity = intensity;
      if (radius !== undefined) bloom.mipmapBlurPass.radius = radius;
      if (threshold !== undefined) bloom.luminanceMaterial.threshold = threshold;
    },
    setAberration(v) { aberration.offset.set(v, v * 0.6); },
    setAnamorphic(v) { anamorphic.uniforms.get('uStrength').value = v; },
    setMotionBlur(v) { motion.uniforms.get('uStrength').value = v * CP.motionBlur; },
    // layers: [[scene, camera], ...] rendered in order into the HDR buffer
    setLayers(layers) { renderPass.layers = layers; },
    setFlare(x, y, strength) { flare.uniforms.get('uSun').value.set(x, y); flare.uniforms.get('uStrength').value = strength; },
    resetSmokeHistory() { smokePass.histValid = false; },
    setSize(w, h) { composer.setSize(w, h); },
    render(dt) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (first) { prevVP.copy(curVP); first = false; }
      motion.uniforms.get('uPrevVP').value.copy(prevVP);
      motion.uniforms.get('uInvVP').value.copy(curVP).invert();
      prevVP.copy(curVP);
      autoExposure.dt = dt;
      composer.render(dt);
      // the adapted value ping-pongs between two targets: point the shader at the fresh one
      u.get('tAdapt').value = autoExposure.texture;
    },
  };
}
