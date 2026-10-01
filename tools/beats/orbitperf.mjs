export default async ({ ev, page, sim }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 30000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); s.focusMinutes = 25; s.sessionEnd = 7 + 1500; s.orbit.sessionSeconds = 1500; });
  await ev(() => { window.__ign.fixedDt = 0; });
  const probe = async (label, jumpTo) => {
    await ev((t) => { window.__ign.seq.orbitStart = performance.now() / 1000 - t; }, jumpTo);
    await page.waitForTimeout(5000);   // let tiles arrive
    const r = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const end = last + 2500; const f = () => { const n = performance.now(); t.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(t); }; requestAnimationFrame(f); }));
    r.sort((a, b) => a - b);
    const st = await ev(() => window.__ign.seq.orbit.earth.tiles.stats);
    console.log(label.padEnd(10), 'median', r[r.length >> 1].toFixed(1), 'p95', r[Math.floor(r.length * 0.95)].toFixed(1), 'tiles', st.tiles);
  };
  await probe('night', 2); await probe('sunrise', 8); await probe('day', 400); await probe('day2', 900);
};
