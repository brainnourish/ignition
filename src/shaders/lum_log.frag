// 64x64 metering grid: 16 taps per output texel, log2 luminance, centre weighted.
uniform sampler2D tInput;
uniform float uCenterWeight;
varying vec2 vUv;
void main() {
  vec2 cell = vec2(1.0 / 64.0);
  float acc = 0.0, lin = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * cell * 0.25;
    vec3 c = texture2D(tInput, uv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    acc += clamp(log2(l + 1e-5), -16.0, 12.0);
    lin += min(l, 2000.0);
  }
  float r = length((vUv - 0.5) * vec2(1.3, 1.0));
  float w = mix(1.0, 1.0 - smoothstep(0.1, 0.75, r) * 0.85, uCenterWeight);
  // r: weighted log luminance, g: weight, b: weighted linear luminance (highlight sensitive)
  gl_FragColor = vec4(acc / 16.0 * w, w, lin / 16.0 * w, 1.0);
}
