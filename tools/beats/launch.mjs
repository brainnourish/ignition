export default async ({ sim, shot, ev }) => {
  await sim(1.0); await shot('01-idle');
  await ev(() => window.__ign.seq.press());
  await sim(1.0); await shot('02-hold-1.0');
  await sim(1.0); await shot('03-hold-2.0');
  await sim(1.1); await shot('04-hold-full');
  await ev(() => window.__ign.seq.release());
  await sim(0.05); await shot('05-flash');
  await sim(0.45); await shot('06-rel+0.5');
  await sim(1.0); await shot('07-rel+1.5');
  await sim(1.5); await shot('08-rel+3');
  await sim(2.0); await shot('09-rel+5');
  await sim(2.0); await shot('10-rel+7');
  await sim(1.9); await shot('11-rel+8.9');
};
