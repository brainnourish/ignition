// Launch loudness and brightness: RMS (dBFS) and share of energy above 1 kHz, measured at the output.
export default async ({ ev, page }) => {
  await page.keyboard.press('Shift');   // first gesture starts the audio
  await ev(() => { window.__ign.fixedDt = 0; });
  if (process.env.OLD) await ev(() => { const a = window.__ign.CONFIG_AUDIO; Object.assign(a, { rumble: 0.9, roar: 0.7, roarMaxCutoff: 4000, crackle: 1, thump: 1 }); });
  await ev(() => {
    const s = window.__ign.sound, ctx = s.ctx;
    const an = ctx.createAnalyser(); an.fftSize = 4096; s.master.connect(an);
    window.__meter = () => {
      const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f);
      const t = new Float32Array(an.fftSize); an.getFloatTimeDomainData(t);
      let rms = 0; for (const v of t) rms += v * v; rms = Math.sqrt(rms / t.length);
      let lo = 0, hi = 0; const hz = ctx.sampleRate / an.fftSize;
      f.forEach((db, i) => { const p = Math.pow(10, db / 10); if (i * hz > 1000) hi += p; else lo += p; });
      return { dB: (20 * Math.log10(rms + 1e-9)).toFixed(1), above1k: (100 * hi / (hi + lo)).toFixed(1) + '%' };
    };
  });
  const read = async (l) => console.log((process.env.OLD ? 'OLD ' : 'NEW ') + l.padEnd(12), JSON.stringify(await ev(() => window.__meter())));
  await ev(() => window.__ign.seq.press());
  await page.waitForTimeout(1500); await read('hold 1.5s');
  await page.waitForTimeout(2200); await read('hold full');
  await ev(() => window.__ign.seq.release());
  await page.waitForTimeout(300); await read('ignition');
  await page.waitForTimeout(1500); await read('liftoff');
  await page.waitForTimeout(2000); await read('climb');
};
