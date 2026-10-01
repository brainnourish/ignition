// Earth-only views at fixed moments for grading against NASA photos (cabin hidden unless CABIN=1).
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  if (!process.env.CABIN) await ev(() => { window.__ign.seq.orbit.cabin.scene.visible = false; });
  // session of 25 minutes so the day is long and the sun climbs high
  await ev(() => { const s = window.__ign.seq; s.focusMinutes = 25; s.sessionEnd = 7 + 1500; s.orbit.sessionSeconds = 1500; });
  const at = async (t, name, settle = 3) => {
    await ev((t) => { const s = window.__ign.seq; s.orbitStart = window.__ign.simT - t; }, t - settle);
    await sim(settle);
    // hold the moment (freeze the clock) until the imagery for it has streamed in
    // hold the moment: time crawls (frames keep running so tiles are requested and drawn)
    await ev(() => { window.__ign.fixedDt = 1e-6; });
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(300); const st = await ev(() => window.__ign.seq.orbit.earth.tiles.stats); if (st.tiles >= st.selected && st.selected > 0 && await ev(() => { const L = window.__ign.seq.orbit.earth.tiles.layers; return L.mask.queue.length + L.mask.inflight + L.land.inflight + L.height.inflight + L.height.queue.length === 0; })) break; }
    await ev(() => { window.__ign.fixedDt = 1 / 60; });
    await sim(0.1); await shot(name);
  };
  await at(2, 'night');
  await at(7.6, 'sunrise');
  await at(12, 'rise+5');
  await at(60, 'lowsun');
  await at(150, 'morning');
  await at(220, 'terrain1');
  await at(300, 'terrain2');
  await at(400, 'day');
  await at(900, 'highday');
};
