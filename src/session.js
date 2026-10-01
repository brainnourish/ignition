// Session time comes from real timestamps, never from summed frame deltas: a background tab
// (no animation frames) stays exact. performance.now() is monotonic and keeps running while hidden.
// Automated captures step a fixed simulated clock instead.
export const now = () => (window.__ign && window.__ign.fixedDt ? window.__ign.simT : performance.now() / 1000);

// A worker's timer keeps ticking in a hidden tab (main-thread timers get throttled hard), so the
// countdown in the tab title stays live while the viewer is elsewhere.
export function startTicker(fn, ms = 500) {
  try {
    const src = `setInterval(() => postMessage(0), ${ms});`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return w;
  } catch (e) {
    return setInterval(fn, ms);
  }
}
