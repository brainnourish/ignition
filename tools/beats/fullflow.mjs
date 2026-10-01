// The whole piece in real time (1-minute session), as a viewer would see it.
export default async ({ shot, ev, page }) => {
  await ev(() => { window.__ign.fixedDt = 0; });
  await page.waitForTimeout(1500); await shot('f01-idle');
  await ev(() => window.__ign.seq.press());
  await page.waitForTimeout(2000); await shot('f02-hold');
  await page.waitForTimeout(1600); await shot('f03-hold-full');
  await ev(() => window.__ign.seq.release());
  await page.waitForTimeout(60); await shot('f04-ignition');
  await page.waitForTimeout(1800); await shot('f05-liftoff');
  await page.waitForTimeout(3000); await shot('f06-climb');
  await page.waitForFunction(() => window.__ign.seq.inOrbit, null, { timeout: 30000 });
  await page.waitForTimeout(2500); await shot('f07-window-night');
  await page.waitForFunction(() => window.__ign.seq.sessionStarted, null, { timeout: 30000 });
  await page.waitForTimeout(400); await shot('f08-sunrise');
  await page.waitForTimeout(3000); await shot('f09-sunrise+3');
  await page.waitForTimeout(20000); await shot('f10-day');
  const errs = await ev(() => window.__ign.seq.state);
  await page.waitForFunction(() => window.__ign.seq.state === 'orbitEnd', null, { timeout: 60000 });
  await shot('f11-sunset');
  await page.waitForFunction(() => window.__ign.seq.state === 'ended', null, { timeout: 30000 });
  await page.waitForTimeout(2000); await shot('f12-ended');
  console.log('avg frame ms at the end', await ev(() => window.__ign.avgMs && window.__ign.avgMs.toFixed(1)), 'dpr', await ev(() => window.__ign.renderer.getPixelRatio()));
};
