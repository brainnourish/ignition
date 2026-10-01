// Metered luminance through the orbit timeline (for calibrating the orbit exposure profile).
export default async ({ sim, ev, page, shot }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 30000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  const rd = async (label) => { const e = await ev(() => { const r = window.__ign.post.readExposure(); const o = window.__ign.seq.orbit; return { a: r.adapted.toFixed(2), log: r.logAvg.toFixed(2), lin: r.linMean.toFixed(2), h: o.sunHeightDeg.toFixed(2), vis: o.sunVis.toFixed(2), inView: o.sunInView.toFixed(2) }; }); console.log(label.padEnd(10), JSON.stringify(e)); };
  for (const [dt, l] of [[2, 'night'], [4, 'predawn'], [1.3, 'rise'], [2, 'rise+2'], [6, 'rise+8'], [12, 'rise+20'], [16, 'rise+36'], [16, 'rise+52'], [7, 'set'], [3, 'set+3']]) { await sim(dt); await rd(l); await shot('p-' + l); }
};
