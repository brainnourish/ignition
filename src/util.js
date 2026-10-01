export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const expDecay = (current, target, rate, dt) => lerp(target, current, Math.exp(-rate * dt));

// Smooth pseudo-random 1D signal for camera shake (sum of incommensurate sines).
export function wobble(t, seed) {
  return (
    Math.sin(t * 1.0 + seed * 1.7) * 0.55 +
    Math.sin(t * 2.31 + seed * 3.1) * 0.3 +
    Math.sin(t * 4.1 + seed * 0.7) * 0.15
  );
}

// Vertical field of view that keeps at least minH degrees horizontally (portrait screens widen it).
export function fovFor(baseV, aspect, minH) {
  const need = (2 * Math.atan(Math.tan((minH * Math.PI) / 360) / Math.max(aspect, 0.1)) * 180) / Math.PI;
  return Math.max(baseV, need);
}
