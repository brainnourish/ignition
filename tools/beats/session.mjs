// Focus-timer checks. Prints PASS/FAIL lines and captures the ending.
export default async ({ sim, shot, ev, page }) => {
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
  // sound is on by default and starts with the first gesture
  await page.keyboard.press('Shift');
  ok(await ev(() => window.__ign.sound.enabled && !!window.__ign.sound.ctx), 'sound on by default, started by the first gesture');
  // 1. preset remembered across a reload
  for (let i = 0; i < 3; i++) await page.click('#lenUp');   // 1 -> 5 -> 10 -> 15
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ign && window.__ign.frames > 5);
  ok(await ev(() => window.__ign.seq.focusMinutes === 15 && document.getElementById('lenVal').textContent === '15'), 'length 15 remembered after reload');
  await page.keyboard.press('ArrowRight');
  ok(await ev(() => window.__ign.seq.focusMinutes === 20), 'arrow key steps the length (20)');
  await page.mouse.move(200, 200); await page.mouse.wheel(0, 120);
  ok(await ev(() => window.__ign.seq.focusMinutes === 20), 'wheel away from the stepper does nothing');
  await page.click('#snd');
  ok(await ev(() => !window.__ign.sound.enabled), 'the corner dot turns sound off');
  await page.click('#snd');
  ok(await ev(() => window.__ign.sound.enabled && window.__ign.sound.ctx && window.__ign.sound.ctx.state !== 'closed'), `and back on (${await ev(() => window.__ign.sound.ctx && window.__ign.sound.ctx.state)})`);
  for (let i = 0; i < 6; i++) await page.click('#lenDown');
  ok(await ev(() => window.__ign.seq.focusMinutes === 1), 'stepper back to 1 (and clicks never started a hold)');
  ok(await ev(() => window.__ign.seq.state === 'idle'), 'still idle');
  await page.waitForFunction(() => window.__ign.seq.orbit.ready, null, { timeout: 30000 });

  // 2. real-timestamp session: no fixed step; freeze rendering (like a background tab) and check the clock
  await ev(() => { window.__ign.fixedDt = 0; const s = window.__ign.seq; s.state = 'flight'; s.flightT = 1; s.enterOrbit(); });
  await page.waitForTimeout(7600);   // night open is 7 s: the session starts at sunrise
  ok(await ev(() => window.__ign.seq.sessionStarted), 'session starts at sunrise');
  const r0 = await ev(() => window.__ign.seq.remaining());
  ok(Math.abs(r0 - (60 - 0.6)) < 0.5, `remaining after sunrise ~59.4s (got ${r0.toFixed(2)})`);
  ok(await ev(() => /^(01:00|00:59) · ignition$/.test(document.title)), `title counts down (${await ev(() => document.title)})`);
  await ev(() => { window.__ign.paused = true; window.__ign.seq.onHidden(); });
  await page.waitForTimeout(5000);
  const title = await ev(() => document.title);
  ok(/^00:5[45] · ignition$/.test(title), `title still counting with no frames (${title})`);
  await ev(() => { window.__ign.paused = false; window.__ign.seq.onVisible(); });
  await page.waitForTimeout(200);
  const r1 = await ev(() => window.__ign.seq.remaining());
  ok(Math.abs((r0 - r1) - 5.2) < 0.4, `5s with no frames still counted (${(r0 - r1).toFixed(2)}s)`);
  ok(await ev(() => window.__ign.seq.leaves === 1), 'one leave counted');
  await page.waitForTimeout(300); await shot('s1-return-blink');
  await ev(() => { window.__ign.seq.onHidden(); window.__ign.seq.onVisible(); });
  ok(await ev(() => window.__ign.seq.leaves === 2), 'second leave counted');

  // 3. the visible 'end session' control, then Escape -> confirm -> early sunset
  await page.mouse.move(500, 500); await page.mouse.move(520, 510);
  ok(await ev(() => document.getElementById('end').classList.contains('show')), "pointer movement shows 'end session'");
  await page.click('#endBtn');
  ok(await ev(() => window.__ign.ui.confirming), "'end session' asks first");
  await page.keyboard.press('Escape');
  ok(await ev(() => !window.__ign.ui.confirming), 'escape cancels the question');
  await page.keyboard.press('Escape');
  ok(await ev(() => window.__ign.ui.confirming), 'escape asks first');
  await shot('s2-confirm');
  await page.keyboard.press('Escape');
  ok(await ev(() => !window.__ign.ui.confirming && window.__ign.seq.state === 'orbit'), 'second escape cancels');
  await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
  const endIn = await ev(() => window.__ign.seq.remaining());
  ok(endIn > 8 && endIn < 9.5, `confirmed: the sun sets in ~9s (${endIn.toFixed(2)})`);
  await page.waitForTimeout(4000); await shot('s3-early-sunset');
  await page.waitForTimeout(5500);
  ok(await ev(() => window.__ign.seq.state === 'orbitEnd'), 'sunset reached at zero');
  ok(await ev(() => window.__ign.sound.humTarget === 1), 'cabin hum on in orbit');
  ok(await ev(() => window.__ign.seq.orbit.sunVis < 0.01), `sun gone at zero (vis ${await ev(() => window.__ign.seq.orbit.sunVis.toFixed(3))})`);
  await page.waitForTimeout(7000);
  ok(await ev(() => window.__ign.seq.state === 'ended'), 'ended');
  const words = await ev(() => document.getElementById('msg').textContent + ' / ' + document.getElementById('hint').textContent);
  ok(words === 'your ascent is complete / hold to launch again', words);
  ok(await ev(() => document.title === 'ignition'), 'title restored');
  await page.waitForTimeout(1600); await shot('s4-ended');
  // 4. hold to launch again returns to the pad
  await ev(() => window.__ign.seq.press());
  await page.waitForTimeout(400);
  ok(await ev(() => !window.__ign.seq.inOrbit && window.__ign.seq.state === 'hold'), 'hold returns to the pad');
  await ev(() => window.__ign.seq.release());
};
