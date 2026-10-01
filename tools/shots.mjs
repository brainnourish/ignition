// Screenshots at exact simulated times. node tools/shots.mjs <outDir> [launch|abort|orbit] [dpr]
// Simulation runs on a fixed 1/60 step, so every run lands on the same frames.
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'shots/tmp';
const mode = process.argv[3] || 'launch';
const dpr = Number(process.argv[4] || 1);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const mobile = !!process.env.MOBILE;
const page = await browser.newPage(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await new Promise((r) => setTimeout(r, 3500)); // let vite settle after edits
await page.goto((process.env.URL || 'http://localhost:5190/') + (process.env.Q || ''), { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5, null, { timeout: 20000 });
await page.evaluate(() => { window.__ign.fixedDt = 1 / 60; });
const t0 = Date.now();
const sim = (s) => page.evaluate((n) => new Promise((r) => { const st = window.__ign.frames; const f = () => (window.__ign.frames - st >= n ? r() : requestAnimationFrame(f)); f(); }), Math.round(s * 60));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`shot ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
globalThis.ctx = { page, sim, shot, ev };
const script = (await import(`./beats/${mode}.mjs`)).default;
// a dev-server reload can land mid-run right after an edit: start the beat over (twice at most)
for (let attempt = 0; ; attempt++) {
  try { await script(globalThis.ctx); break; } catch (e) {
    if (attempt >= 2 || !/Execution context was destroyed|navigation/.test(String(e))) throw e;
    console.log('page reloaded under us, retrying');
    await new Promise((r) => setTimeout(r, 2500));
    await page.goto((process.env.URL || 'http://localhost:5190/') + (process.env.Q || ''), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__ign && window.__ign.frames > 5, null, { timeout: 20000 });
    await page.evaluate(() => { window.__ign.fixedDt = 1 / 60; });
  }
}
await browser.close();
