uniform vec2 uSun;          // sun position, uv
uniform float uStrength;    // 0 when the sun is hidden
uniform vec3 uTint;
// Restrained lens ghosts: a few soft discs on the line through the frame centre, faint chromatic edges.
float ghost(vec2 uv, vec2 c, float r, float soft) {
  vec2 d = uv - c;
  d.x *= aspect;
  float l = length(d);
  return smoothstep(r, r * (1.0 - soft), l);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength < 1e-4) { outputColor = inputColor; return; }
  vec2 axis = vec2(0.5) - uSun;
  vec3 acc = vec3(0.0);
  // (position along the axis, radius, weight, tint)
  acc += ghost(uv, uSun + axis * 0.55, 0.035, 0.6) * vec3(0.30, 0.55, 0.35) * 0.5;
  acc += ghost(uv, uSun + axis * 1.25, 0.07, 0.35) * vec3(0.35, 0.40, 0.65) * 0.35;
  acc += ghost(uv, uSun + axis * 1.55, 0.018, 0.5) * vec3(0.8, 0.55, 0.35) * 0.8;
  acc += ghost(uv, uSun + axis * 1.9, 0.12, 0.25) * vec3(0.30, 0.45, 0.35) * 0.18;
  // faint ring (aperture ghost)
  vec2 d = uv - (uSun + axis * 2.2); d.x *= aspect;
  float ring = smoothstep(0.018, 0.0, abs(length(d) - 0.16));
  acc += ring * vec3(0.4, 0.3, 0.55) * 0.12;
  outputColor = vec4(inputColor.rgb + acc * uTint * uStrength, inputColor.a);
}
