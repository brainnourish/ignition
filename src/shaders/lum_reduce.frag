// 4x4 box reduction of the (weighted log luminance, weight) pair.
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 acc = vec3(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    acc += texture2D(tInput, vUv + (vec2(float(x), float(y)) - 1.5) * uTexel).rgb;
  }
  gl_FragColor = vec4(acc / 16.0, 1.0);
}
