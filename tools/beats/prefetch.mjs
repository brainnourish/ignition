// Does the launch give the window enough time to load its imagery?
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await ev(() => { window.__ign.fixedDt = 0; });   // real time: network is real
  await ev(() => window.__ign.seq.press()); await page.waitForTimeout(3700); console.log("state at release", await ev(() => window.__ign.seq.state + " " + window.__ign.seq.holdT.toFixed(2))); await ev(() => window.__ign.seq.release());
  const t0 = Date.now();
  await page.waitForFunction(() => window.__ign.seq.inOrbit, null, { timeout: 30000 });
  console.log('cut after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await page.waitForTimeout(300);
  const st = await ev(() => window.__ign.seq.orbit.earth.tiles.stats);
  console.log('at the cut:', JSON.stringify(st));
  await page.waitForTimeout(1500); await shot('p1-window');
};
