export default async ({ sim, shot, ev }) => {
  await sim(1.0);
  await ev(() => window.__ign.seq.press());
  await sim(2.2); await shot('a1-hold-2.2');
  await ev(() => window.__ign.seq.release());
  await sim(0.3); await shot('a2-abort+0.3');
  await sim(1.2); await shot('a3-abort+1.5');
  await sim(3.0); await shot('a4-idle-again');
};
