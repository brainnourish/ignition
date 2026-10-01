// Prints metered vs adapted luminance through the launch. node tools/probe_exposure.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5, null, { timeout: 15000 });
await page.evaluate(() => { window.__ign.fixedDt = 1 / 30; });
const frames = (n) => page.evaluate((n) => new Promise((r) => { const s = window.__ign.frames; const f = () => (window.__ign.frames - s >= n ? r() : requestAnimationFrame(f)); f(); }), n);
const rd = async (label) => { const e = await page.evaluate(() => { const r = window.__ign.post.readExposure(); return { a: r.adapted.toFixed(2), log: r.logAvg.toFixed(2), lin: r.linMean.toFixed(2) }; }); console.log(label.padEnd(12), JSON.stringify(e)); };
await frames(40); await rd('idle');
await page.evaluate(() => window.__ign.seq.press());
for (let i = 0; i < 6; i++) { await frames(17); await rd('hold ' + ((i + 1) * 17 / 30).toFixed(1)); }
await page.evaluate(() => window.__ign.seq.release());
for (let i = 0; i < 10; i++) { await frames(6); await rd('flight ' + ((i + 1) * 0.2).toFixed(1)); }
for (let i = 0; i < 4; i++) { await frames(30); await rd('flight +' + (i + 1)); }
await browser.close();
