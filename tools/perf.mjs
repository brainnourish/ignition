// Frame-time probe through the launch on the real GPU. Usage: node tools/perf.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DPR || 1) });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5);
const probe = async (label, ms = 1500) => {
  const r = await page.evaluate((ms) => new Promise((res) => { const t = []; let last = performance.now(); const end = last + ms; const f = () => { const n = performance.now(); t.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }), ms);
  r.sort((a, b) => a - b);
  const g = window => 0;
  const st = await page.evaluate(() => ({ smoke: window.__ign.smoke.count, state: window.__ign.seq.state, alt: Math.round(window.__ign.seq.alt) }));
  console.log(label.padEnd(14), 'frames', r.length, 'median', r[r.length >> 1].toFixed(1), 'p95', r[Math.floor(r.length * 0.95)].toFixed(1), JSON.stringify(st));
};
await probe('idle');
await page.evaluate(() => window.__ign.seq.press());
await probe('hold', 3200);
await page.evaluate(() => window.__ign.seq.release());
await probe('liftoff 0-1.5');
await probe('liftoff 1.5-3');
await probe('liftoff 3-4.5');
await probe('liftoff 4.5-6');
await probe('liftoff 6-7.5');
await probe('orbit', 3000);
await browser.close();
