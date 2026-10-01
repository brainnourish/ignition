// The hero clip. Two passes with the same timeline (sim seconds):
//   video (default): exact 1/30 s steps, one screenshot per frame -> OUT/frames/%05d.png
//   AUDIO=1:         real time, records the synthesized mix -> OUT/audio.webm
// 0 idle · 1.2 press · 4.8 release · ~13.4 cut · cut+2 skip 3 s of night · sunrise ~cut+4 · end CLIP_END
import fs from 'node:fs';
const PRESS = 1.2, RELEASE = 4.8, SKIP_AT = 2.0, SKIP = 3.0, END_AFTER_RISE = 9.5;
export default async ({ ev, page }) => {
  const out = process.argv[2];
  await page.addStyleTag({ content: '#snd, #credit, #end { display: none !important; } body { cursor: none; }' });
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 60000 });
  // a 25 minute session (shows 25:00 on the glass at sunrise)
  await ev(() => { const u = window.__ign.ui; while (u.minutes < 25) u.step(1); while (u.minutes > 25) u.step(-1); });
  await page.keyboard.press('Shift');   // first gesture: starts the audio
  const audio = !!process.env.AUDIO;
  // the shared timeline, driven from simulated time
  const state = { pressed: false, released: false, skipped: false, cut: null, rise: null };
  const step = async (simT) => {
    const g = await ev(() => ({ inOrbit: window.__ign.seq.inOrbit, started: window.__ign.seq.sessionStarted }));
    if (!state.pressed && simT >= PRESS) { state.pressed = true; await ev(() => window.__ign.seq.press()); }
    if (!state.released && simT >= RELEASE) { state.released = true; await ev(() => window.__ign.seq.release()); }
    if (g.inOrbit && state.cut === null) state.cut = simT;
    if (state.cut !== null && !state.skipped && simT >= state.cut + SKIP_AT) { state.skipped = true; await ev((s) => { window.__ign.seq.orbitStart -= s; }, SKIP); }
    if (g.started && state.rise === null) state.rise = simT;
    return state.rise !== null && simT >= state.rise + END_AFTER_RISE;
  };
  if (!audio) {
    fs.mkdirSync(`${out}/frames`, { recursive: true });
    await ev(() => { window.__ign.fixedDt = 1 / 30; window.__ign.paused = true; window.__ign.quality = 'fixed'; window.__t0 = window.__ign.simT; });
    for (let f = 0; f < 2000; f++) {
      const simT = f / 30;
      if (await step(simT)) break;
      await ev(() => { window.__ign.steps = 1; });
      await page.waitForFunction(() => window.__ign.steps === 0);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      await page.screenshot({ path: `${out}/frames/${String(f).padStart(5, '0')}.png` });
      if (f % 60 === 0) console.log('frame', f, 'sim', simT.toFixed(1), JSON.stringify(state));
    }
  } else {
    await ev(() => {
      window.__ign.fixedDt = 0; window.__ign.quality = 'fixed';
      const s = window.__ign.sound, dest = s.ctx.createMediaStreamDestination();
      s.output.connect(dest);
      window.__chunks = [];
      window.__rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
      window.__rec.ondataavailable = (e) => window.__chunks.push(e.data);
      window.__rec.start(200);
      window.__t0 = window.__ign.simT;
    });
    for (;;) {
      const simT = await ev(() => window.__ign.simT - window.__t0);
      if (await step(simT)) break;
      await page.waitForTimeout(10);
    }
    const b64 = await ev(() => new Promise((res) => { window.__rec.onstop = async () => { const buf = await new Blob(window.__chunks).arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); res(btoa(s)); }; window.__rec.stop(); }));
    fs.writeFileSync(`${out}/audio.webm`, Buffer.from(b64, 'base64'));
    console.log('audio written', JSON.stringify(state));
  }
};
