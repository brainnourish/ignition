// The mid-session pad: plays without error, sits above the hum, stays quiet.
export default async ({ ev, page }) => {
  await page.keyboard.press('Shift');
  await ev(() => { window.__ign.fixedDt = 0; });
  await ev(() => {
    const s = window.__ign.sound, ctx = s.ctx;
    const an = ctx.createAnalyser(); an.fftSize = 8192; s.musicBus.connect(an);
    window.__meter = () => {
      const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t); let r = 0; for (const v of t) r += v * v;
      const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f); const hz = ctx.sampleRate / an.fftSize;
      let lo = 0, tot = 0; f.forEach((db, i) => { const p = Math.pow(10, db / 10); tot += p; if (i * hz < 250) lo += p; });
      return { dB: (20 * Math.log10(Math.sqrt(r / t.length) + 1e-9)).toFixed(1), below250Hz: (100 * lo / tot).toFixed(1) + '%' };
    };
  });
  for (let k = 0; k < 2; k++) {
    await ev(() => window.__ign.sound.pad());
    for (const w of [5000, 8000]) { await page.waitForTimeout(w); console.log(`pad ${k + 1} +${w / 1000}s`, JSON.stringify(await ev(() => window.__meter())), 'voices', await ev(() => window.__ign.sound.voices.size)); }
  }
};
