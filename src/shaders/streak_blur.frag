uniform sampler2D tInput;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float fi = float(i);
    float w = 1.0 - abs(fi) / 13.0;
    acc += texture2D(tInput, vUv + uStep * fi).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}
