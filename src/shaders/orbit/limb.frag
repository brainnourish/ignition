#include atmos.glsl
uniform vec3 uCenter;
uniform float uAirglow;
varying vec3 vWorld;
// The atmosphere seen against space (rays that miss the planet). Additive over the sky.
void main() {
  vec3 o = cameraPosition - uCenter;
  vec3 d = normalize(vWorld - cameraPosition);
  vec2 tg = raySphere(o, d, RG - 1.5);
  if (tg.y > 0.0) discard;         // the planet itself draws this pixel
  vec3 Tv;
  vec3 ins = limbGrade(inscatter(o, d, 1e9, Tv));
  // night-side airglow: a faint green line ~95 km up, only visible edge-on
  vec2 ta = raySphere(o, d, RG + 95.0);
  float grazing = 0.0;
  if (ta.y > 0.0) {
    float chord = ta.y - ta.x;
    grazing = smoothstep(0.0, 600.0, chord) * (1.0 - smoothstep(600.0, 1800.0, chord));
  }
  float closest = length(o + d * max(-dot(o, d), 0.0)) - RG;
  float band = exp(-pow((closest - 95.0) / 3.5, 2.0));
  ins += vec3(0.3, 1.0, 0.5) * band * uAirglow * 0.0009;
  gl_FragColor = vec4(ins, 1.0);
}
