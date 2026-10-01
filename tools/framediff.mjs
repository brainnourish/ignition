import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ign && window.__ign.frames > 5);
await page.evaluate(() => { window.__ign.fixedDt = 1 / 60; const g = window.__ign; const o = g.seq.rig.update.bind(g.seq.rig); g.seq.rig.update = (dt, rp, alt, sh, f) => o(dt, rp, alt, 0, f); g.smoke.mesh.visible = false; });
const frames = async (n) => page.evaluate((n) => new Promise((r) => { const s = window.__ign.frames; const f = () => (window.__ign.frames - s >= n ? r() : requestAnimationFrame(f)); f(); }), n);
await page.evaluate(() => { const s = window.__ign.seq; s.press(); s.holdT = 3.1; });
await frames(20);
await page.evaluate(() => window.__ign.seq.release());
await frames(120);
const shots = [];
for (let i = 0; i < 6; i++) { shots.push(PNG.sync.read(await page.screenshot({ type: 'png' }))); await frames(1); }
for (let i = 1; i < shots.length; i++) {
  const a = shots[i - 1], b = shots[i];
  const d = new PNG({ width: a.width, height: a.height });
  let rows = new Float64Array(a.height), cols = new Float64Array(a.width), tot = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const k = (y * a.width + x) * 4;
    const la = 0.2126 * a.data[k] + 0.7152 * a.data[k + 1] + 0.0722 * a.data[k + 2];
    const lb = 0.2126 * b.data[k] + 0.7152 * b.data[k + 1] + 0.0722 * b.data[k + 2];
    const v = Math.min(255, Math.abs(la - lb) * 4);
    d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255;
    rows[y] += Math.abs(la - lb); cols[x] += Math.abs(la - lb); tot += Math.abs(la - lb);
  }
  fs.writeFileSync(`${out}/diff${i}.png`, PNG.sync.write(d));
  const band = (arr, n) => { const s = Math.ceil(arr.length / n); const r = []; for (let j = 0; j < n; j++) { let t = 0; for (let k = j * s; k < Math.min(arr.length, (j + 1) * s); k++) t += arr[k]; r.push((t / tot * 100).toFixed(0)); } return r.join(' '); };
  console.log(`diff${i}: total=${(tot / (a.width * a.height)).toFixed(2)}  rows%[top→bottom]: ${band(rows, 10)}  cols%[left→right]: ${band(cols, 10)}`);
}
fs.writeFileSync(`${out}/frame0.png`, PNG.sync.write(shots[0]));
await browser.close();
