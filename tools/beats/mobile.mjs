export default async ({ sim, shot, ev, page }) => {
  console.log('mobile mode', await ev(() => window.matchMedia('(pointer: coarse)').matches), 'dpr', await ev(() => window.__ign.renderer.getPixelRatio()));
  await sim(1); await shot('m1-idle');
  await ev(() => window.__ign.seq.press()); await sim(3.2); await shot('m2-hold');
  await ev(() => window.__ign.seq.release()); await sim(2.0); await shot('m3-liftoff');
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await sim(7.5); await shot('m4-window');
  await ev(() => { window.__ign.fixedDt = 0; }); await page.waitForTimeout(9000); await ev(() => { window.__ign.fixedDt = 1 / 60; });
  await shot('m5-sunrise');
  await ev(() => { const s = window.__ign.seq; s.orbitStart -= 60; }); await sim(8); await shot('m6-ended');
};
