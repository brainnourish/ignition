// The score: level at the output through a 1-minute session (sunrise swell, sunset chord, end note).
export default async ({ ev, page }) => {
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  await ev(() => { window.__ign.fixedDt = 0; });
  await ev(() => {
    const s = window.__ign.sound, ctx = s.ctx;
    const an = ctx.createAnalyser(); an.fftSize = 4096; s.musicBus.connect(an);
    window.__meter = () => { const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t); let r = 0; for (const v of t) r += v * v; return (20 * Math.log10(Math.sqrt(r / t.length) + 1e-9)).toFixed(1); };
    const q = window.__ign.seq; q.state = 'flight'; q.flightT = 1; q.enterOrbit();
  });
  const t0 = Date.now();
  const log = async (l) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s ${l.padEnd(16)} music ${await ev(() => window.__meter())} dB  voices ${await ev(() => window.__ign.sound.voices.size)}`);
  await page.waitForTimeout(5000); await log('night');
  await page.waitForFunction(() => window.__ign.seq.sessionStarted); await page.waitForTimeout(2000); await log('sunrise +2');
  await page.waitForTimeout(6000); await log('sunrise +8');
  await page.waitForTimeout(12000); await log('sunrise +20');
  await page.waitForTimeout(12000); await log('sunrise +32');
  await page.waitForFunction(() => window.__ign.seq.sunsetCued, null, { timeout: 60000 }); await page.waitForTimeout(8000); await log('sunset chord +8');
  await page.waitForFunction(() => window.__ign.seq.state === 'orbitEnd', null, { timeout: 60000 }); await page.waitForTimeout(1500); await log('end note');
  const errs = await ev(() => window.__ign.seq.state); console.log('state', errs);
};
