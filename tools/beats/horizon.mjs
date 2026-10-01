// the horizon moments only (cabin hidden)
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); s.orbit.cabin.scene.visible = false; });
  await sim(0.5); await shot('h1-open');
  await sim(4.5); await shot('h2-predawn');
  await sim(2.3); await shot('h3-sunrise');
  await sim(3.0); await shot('h4-rise+3');
};
