// The launch-to-window cut in real sequence (no jumps).
export default async ({ sim, shot, ev, page }) => {
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 30000 });
  await ev(() => window.__ign.seq.press()); await sim(3.2); await ev(() => window.__ign.seq.release());
  await sim(8.0); await shot('c1-rel+8');
  await sim(0.9); await shot('c2-black');
  await sim(0.9); await shot('c3-fadein');
  await sim(2.0); await shot('c4-window');
};
