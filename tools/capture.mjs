// Headless capture of key beats. Usage: node tools/capture.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5);
await page.evaluate(() => { window.__ign.fixedDt = 1 / 30; });
const frames = async (n) => page.evaluate((n) => new Promise((r) => { const s = window.__ign.frames; const f = () => (window.__ign.frames - s >= n ? r() : requestAnimationFrame(f)); f(); }), n);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };

if (process.argv[3] === 'orbit') {
  await page.evaluate(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  await frames(90); await shot('o1-night');
  await page.evaluate(() => { window.__ign.seq.orbitT = 60 * 0.6; }); await frames(20); await shot('o2-midway');
  await page.evaluate(() => { window.__ign.seq.orbitT = 60 * 0.9; }); await frames(20); await shot('o3-predawn');
  await page.evaluate(() => { window.__ign.seq.orbitT = 60 * 0.995; }); await frames(30); await shot('o4-sunrise');
  await frames(120); await shot('o5-settle-4s');
  await frames(300); await shot('o6-ended');
  await browser.close();
  process.exit(0);
}
if (process.argv[3] === 'abort') {
  await frames(30); await shot('a1-idle');
  await page.evaluate(() => window.__ign.seq.press());
  await frames(60); await shot('a2-hold-2s');
  await page.evaluate(() => window.__ign.seq.release());
  await frames(6); await shot('a3-abort+0.2s');
  await frames(30); await shot('a4-abort+1.2s');
  await frames(60); await shot('a5-abort+3.2s');
  await frames(90); await shot('a6-idle-again');
  await browser.close();
  process.exit(0);
}
if (process.argv[3] === 'abort') {
  await frames(30); await shot('a1-idle');
  await page.evaluate(() => window.__ign.seq.press());
  await frames(60); await shot('a2-hold-2s');
  await page.evaluate(() => window.__ign.seq.release());
  await frames(6); await shot('a3-abort+0.2s');
  await frames(30); await shot('a4-abort+1.2s');
  await frames(60); await shot('a5-abort+3.2s');
  await frames(90); await shot('a6-idle-again');
  await browser.close();
  process.exit(0);
}
await frames(30); await shot('01-idle');
await page.evaluate(() => window.__ign.seq.press());
await frames(20); await shot('02-hold-0.7s');
await frames(24); await shot('03-hold-1.5s');
await frames(30); await shot('04-hold-2.5s');
await frames(24); await shot('05-hold-full');
await page.evaluate(() => window.__ign.seq.release());
await frames(2); await shot('06-flash');
await frames(8); await shot('07-flash+0.3s');
await frames(30); await shot('08-liftoff-1.3s');
await frames(60); await shot('09-liftoff-3.3s');
await frames(90); await shot('10-liftoff-6.3s');
await frames(120); await shot('11-liftoff-10s');
await frames(240); await shot('12-liftoff-18s');
await frames(210); await shot('13-staging-25s');
await frames(150); await shot('14-30s');
await frames(330); await shot('15-end-41s');
const stats = await page.evaluate(() => ({ alt: window.__ign.seq.alt, state: window.__ign.seq.state, smoke: window.__ign.smoke.count }));
console.log(stats);
await browser.close();
