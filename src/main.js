import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildScene } from './scene.js';
import { SmokeSystem } from './smoke.js';
import { Sparks } from './sparks.js';
import { setupPost } from './post.js';
import { CameraRig } from './camera.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { Sequence } from './sequence.js';
import { WetGround } from './reflector.js';
import { startTicker } from './session.js';
import { fovFor } from './util.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.toneMapping = THREE.NoToneMapping; // ACES filmic is applied in the post chain
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.render.fov, 1, CONFIG.render.near, CONFIG.render.far);

const S = buildScene(scene);
const smoke = new SmokeSystem(camera);
const sparks = new Sparks(scene);
const post = setupPost(renderer, scene, camera, smoke);
const wet = new WetGround(scene, smoke);
const rig = new CameraRig(camera);
const sound = new Sound();
const ui = new UI();
smoke.sortOrigin.copy(rig.basePos);
smoke.sortOriginSet = true;
const seq = new Sequence({ scene, S, camera, rig, smoke, sparks, post, sound, ui, renderer, wet });

// ---------- sizing (DPR capped, adaptive)
let dprCap = CONFIG.render.maxDpr;
const currentDpr = () => Math.min(window.devicePixelRatio || 1, dprCap);
function resize() {
  const dpr = currentDpr();
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  camera.aspect = w / h;
  // portrait screens: keep enough horizontal view (the rocket and tower, the whole porthole)
  camera.fov = seq && seq.inOrbit ? fovFor(CONFIG.cabin.fov, camera.aspect, CONFIG.cabin.minHFov) : fovFor(CONFIG.render.fov, camera.aspect, CONFIG.render.minHFov);
  rig.setAspect(camera.aspect);
  camera.updateProjectionMatrix();
  post.setSize(w, h);
  wet.setSize(w * dpr, h * dpr);
  S.stars.uniforms.uPixelRatio.value = dpr;
  sparks.uniforms.uPixelRatio.value = dpr;
}
window.addEventListener('resize', resize);
resize();

// ---------- input: hold to build pressure, release to launch
const isSoundToggle = (e) => e.target && e.target.id === 'snd';
window.addEventListener('pointerdown', (e) => { if (isSoundToggle(e)) return; if (e.button !== undefined && e.button !== 0) return; seq.press(); });
window.addEventListener('pointerup', () => seq.release());
// during a session, moving the pointer reveals a quiet 'end session'
window.addEventListener('pointermove', () => { if (seq.inSession) ui.pokeEnd(true); });
window.addEventListener('pointercancel', () => seq.release());
window.addEventListener('blur', () => seq.release());
window.addEventListener('keydown', (e) => {
  if (ui.confirming) {
    if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') { e.preventDefault(); ui.answer(true); return; }
    if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') { e.preventDefault(); ui.answer(false); return; }
  }
  if (e.key === 'Escape') { if (seq.requestEnd()) e.preventDefault(); return; }
  // session length, before launch: arrow keys step the stepper
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { if (ui.step(-1)) e.preventDefault(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { if (ui.step(1)) e.preventDefault(); return; }
  if (e.code === 'Space' && !e.repeat) { e.preventDefault(); seq.press(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') seq.release(); });
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('snd').addEventListener('click', (e) => { e.stopPropagation(); ui.setSound(sound.toggle()); });
ui.setSound(sound.enabled);
// sound is on by default: start the audio graph on the first gesture of any kind
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, (e) => { if (!isSoundToggle(e)) sound.unlock(); }, { capture: true });

// ---------- page visibility: count leaves during the session, blink the cabin light on return
document.addEventListener('visibilitychange', () => { if (document.hidden) seq.onHidden(); else seq.onVisible(); });
// the tab title keeps counting down even while the tab is in the background
startTicker(() => seq.tickTitle());

// ---------- loop with frame-time watchdog
const clock = new THREE.Clock();
let simT = 0;
let frames = 0, accum = 0, slowStrikes = 0, fastChecks = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  if (window.__ign) window.__ign.frames = (window.__ign.frames || 0) + 1;
  if (window.innerWidth === 0 || window.innerHeight === 0) return;
  // paused (capture stepping): a frame that does not run must not advance the clock either
  if (window.__ign && window.__ign.paused) { if (!(window.__ign.steps > 0)) return; window.__ign.steps--; }
  let dt = Math.min(rawDt, 0.05);
  if (window.__ign && window.__ign.fixedDt) dt = window.__ign.fixedDt;
  simT += dt;
  if (window.__ign) window.__ign.simT = simT;
  const t = simT;
  const start = performance.now();

  seq.update(dt, t);
  smoke.update(dt);
  sparks.update(dt);
  if (!seq.inOrbit) { camera.updateMatrixWorld(); wet.render(renderer, camera, t); }
  post.render(dt);

  // frame-time watchdog: one-off stalls (texture uploads, tab switches) are ignored
  // stalls (texture uploads, tab switches, screenshots) say nothing about sustained cost: skip them
  if (rawDt < 0.1) { accum += rawDt * 1000; frames++; }
  if (frames >= CONFIG.quality.checkFrames && !(window.__ign && window.__ign.quality === 'fixed')) {
    const avg = accum / frames;
    window.__ign && (window.__ign.avgMs = avg);
    frames = 0; accum = 0;
    if (avg > CONFIG.quality.slowMs) {
      slowStrikes++; fastChecks = 0;
      if (slowStrikes >= 2) {
        // in orbit the cost is per pixel (clouds, air): lower the resolution first, in small steps;
        // on the pad the smoke is the expensive part
        if (!seq.inOrbit && smoke.emitScale > CONFIG.quality.minSmokeScale) smoke.emitScale = Math.max(CONFIG.quality.minSmokeScale, smoke.emitScale * 0.7);
        else if (currentDpr() > CONFIG.quality.minDpr) { dprCap = Math.max(CONFIG.quality.minDpr, currentDpr() - 0.25); resize(); }
        slowStrikes = 0;
      }
    } else {
      slowStrikes = 0;
      if (avg < CONFIG.quality.slowMs * 0.5 && ++fastChecks >= 3) {
        fastChecks = 0;
        if (dprCap < CONFIG.render.maxDpr) { dprCap = Math.min(CONFIG.render.maxDpr, dprCap + 0.5); resize(); }
        else if (smoke.emitScale < 1) smoke.emitScale = Math.min(1, smoke.emitScale / 0.7);
      }
    }
  }
}
frame();

// invisible hooks for automated capture
window.__ign = { seq, ui, wet, smoke, CONFIG_AUDIO: CONFIG.audio, renderer, resetQuality() { dprCap = CONFIG.render.maxDpr; smoke.emitScale = 1; resize(); }, camera, sound, post, S, setDpr(v) { dprCap = v; resize(); } };
