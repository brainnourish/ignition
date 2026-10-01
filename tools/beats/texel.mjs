// Texel-to-pixel measurement: the largest projected texel (in drawing-buffer pixels) over every drawn tile.
export default async ({ sim, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  await ev(() => { const s = window.__ign.seq; s.focusMinutes = 25; s.sessionEnd = 7 + 1500; s.orbit.sessionSeconds = 1500; });
  for (const t of [30, 400, 900]) {
    await ev((t) => { window.__ign.seq.orbitStart = window.__ign.simT - t; }, t);
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(400); await sim(0.02); const st = await ev(() => window.__ign.seq.orbit.earth.tiles.stats); if (st.tiles >= st.selected) break; }
    const st = await ev(() => window.__ign.seq.orbit.earth.tiles.stats);
    const f = (v) => v.toFixed(2);
    console.log(`t=${t}s  tiles ${st.tiles}/${st.selected}  maxZ ${st.maxZ}  land ${f(st.maxTexelPx)} px/texel  water(BMNG) ${f(st.maxBasePx)}  night ${f(st.maxNightPx)}`);
  }
};
