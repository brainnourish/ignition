// Transmittance LUT: x = sqrt-warped view zenith cosine, y = sqrt altitude fraction.
#include atmoconst.glsl
varying vec2 vUv;
void main() {
  float x = vUv.x * 2.0 - 1.0;
  float mu = sign(x) * x * x;
  float r = RG + vUv.y * vUv.y * (RT - RG);
  vec3 o = vec3(0.0, r, 0.0);
  vec3 d = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float b = dot(o, d);
  float c = (r - RT) * (r + RT);
  float tTop = -b + sqrt(max(b * b - c, 0.0));
  const int N = 80;
  float dt = tTop / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 p = o + d * (float(i) + 0.5) * dt;
    od += atmoExtinction(atmoDensity(length(p) - RG)) * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}
