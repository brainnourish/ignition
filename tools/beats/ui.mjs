// the words and the timer: pad idle with the length control, the timer on the glass, the end
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  for (let i = 0; i < 5; i++) await page.click('#lenUp');
  await page.mouse.move(900, 300); await sim(1.5); await shot('u1-pad-length');
  await ev(() => { const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  await sim(2.0); await shot('u2-night-frame');
  await sim(6.6); await shot('u3-sunrise-timer');
  await ev(() => { window.__ign.seq.orbitStart -= 300; }); await sim(1);
  await ev(() => { window.__ign.fixedDt = 1e-6; }); await page.waitForTimeout(5000); await ev(() => { window.__ign.fixedDt = 1 / 60; });
  await page.mouse.move(600, 500); await page.mouse.move(640, 520); await sim(0.6); await shot('u4-day-timer-end');
  await ev(() => { window.__ign.seq.sessionEnd = (window.__ign.simT - window.__ign.seq.orbitStart) + 1; window.__ign.seq.orbit.endEarly(window.__ign.simT - window.__ign.seq.orbitStart - 8.5); }); await sim(10); await page.waitForTimeout(2600); await shot('u5-ended');
};
