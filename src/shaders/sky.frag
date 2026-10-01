uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGlowCol;
uniform float uGlow;
uniform vec3 uGlowDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.4, h));
  col += uHorizon * 0.6 * exp(-max(h, 0.0) * 18.0);
  // fire lighting the sky: warm dome around the pad direction, strongest low
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uGlowDir.x, 0.0, uGlowDir.z))), 0.0);
  float dome = exp(-max(h, 0.0) * 3.2) * (0.35 + 0.65 * toward * toward);
  col += uGlowCol * uGlow * dome;
  gl_FragColor = vec4(col, 1.0);
}
