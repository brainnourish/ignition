// Orbit beats: jump straight to the cut, then step through the 1-minute session.
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 30000 });
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  await sim(2.0); await shot('o01-night');
  await sim(4.0); await shot('o02-predawn');
  await sim(1.3); await shot('o03-sunrise');
  await sim(1.0); await shot('o04-rise+1');
  await sim(1.5); await shot('o05-rise+2.5');
  await sim(5.5); await shot('o06-rise+8');
  await sim(12.0); await shot('o07-rise+20');
  await sim(16.0); await shot('o08-rise+36');
  await sim(16.0); await shot('o09-rise+52');
  await sim(6.0); await shot('o10-rise+58');
  await sim(2.2); await shot('o11-sunset');
  await sim(3.0); await shot('o12-set+3');
  await sim(6.0); await shot('o13-ended');
};
