// Measures frame-to-frame brightness jitter during liftoff (dev server must be running).
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5);
await page.evaluate(() => { window.__ign.fixedDt = 1 / 60; });
const mode = process.argv[2] || 'base';
await page.evaluate((mode) => {
  const g = window.__ign;
  if (mode.includes('noshake')) { const o = g.seq.rig.update.bind(g.seq.rig); g.seq.rig.update = (dt, rp, alt, sh, f) => o(dt, rp, alt, 0, f); }
  if (mode.includes('nosort')) g.smoke.count, g.smoke.noSort = true;
  if (mode.includes('nosmoke')) g.smoke.mesh.visible = false;
  if (mode.includes('noblur')) { const o = g.seq.post.setMotionBlur; g.seq.post.setMotionBlur = () => o(0); }
  const E = g.post.effects;
  if (mode.includes('nogod')) { E.godRays.blendMode.opacity.value = 0; g.seq.post.setGodRays = () => {}; }
  if (mode.includes('nostreak')) { g.seq.post.setAnamorphic = () => {}; E.anamorphic.uniforms.get('uStrength').value = 0; }
  if (mode.includes('nograin')) E.noise.blendMode.opacity.value = 0;
  if (mode.includes('nobloom')) { E.bloom.blendMode.opacity.value = 0; g.seq.post.setBloom = () => {}; }
  if (mode.includes('noplume')) { for (const p of [...g.seq.enginePlumes, g.seq.mainPlume, ...g.seq.splash]) { p.mesh.visible = false; p.set = () => {}; } }
  if (mode.includes('nolights')) { g.seq.S.engineLight.visible = false; g.seq.S.trenchLight.visible = false; g.seq.S.bounceLight.visible = false; }
  if (mode.includes('noca')) { E.aberration.blendMode.opacity.value = 0; g.seq.post.setAberration = () => {}; }
}, mode);
const frames = async (n) => page.evaluate((n) => new Promise((r) => { const s = window.__ign.frames; const f = () => (window.__ign.frames - s >= n ? r() : requestAnimationFrame(f)); f(); }), n);
await page.evaluate(() => { const s = window.__ign.seq; s.press(); s.holdT = 3.1; });
await frames(20);
await page.evaluate(() => window.__ign.seq.release());
await frames(120); // 2s after release
const means = [];
await page.evaluate(() => { window.__ign.paused = true; });
const step = async () => { await page.evaluate(() => { window.__ign.steps = 1; }); await page.waitForFunction(() => window.__ign.steps === 0); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
for (let i = 0; i < 30; i++) {
  await step();
  const buf = await page.screenshot({ type: 'png' });
  const png = PNG.sync.read(buf);
  let sum = 0, n = 0;
  // lower 60% of the frame: the smoke cloud
  for (let y = Math.floor(png.height * 0.4); y < png.height; y += 2) for (let x = 0; x < png.width; x += 2) {
    const k = (y * png.width + x) * 4; sum += 0.2126 * png.data[k] + 0.7152 * png.data[k + 1] + 0.0722 * png.data[k + 2]; n++;
  }
  means.push(sum / n);
}
const diffs = means.slice(1).map((m, i) => Math.abs(m - means[i]));
const avg = means.reduce((a, b) => a + b) / means.length;
console.log(mode, 'mean', avg.toFixed(2), 'avg |frame diff|', (diffs.reduce((a, b) => a + b) / diffs.length).toFixed(3), 'max diff', Math.max(...diffs).toFixed(3));
console.log(means.map((m) => m.toFixed(1)).join(' '));
await browser.close();
