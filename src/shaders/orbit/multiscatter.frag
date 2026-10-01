// Multiple-scattering LUT (Hillaire 2020): x = sun zenith cosine, y = altitude fraction.
// Psi_ms = L2 / (1 - f_ms), integrated over the sphere of directions with an isotropic phase.
#include atmoconst.glsl
uniform sampler2D tTransmittance;
varying vec2 vUv;
vec2 transUv(float r, float mu) {
  return vec2(0.5 + 0.5 * sign(mu) * sqrt(abs(mu)), sqrt(clamp((r - RG) / (RT - RG), 0.0, 1.0)));
}
vec3 transTop(float r, float mu) {
  float muH = -sqrt(max(0.0, 1.0 - (RG * RG) / (r * r)));
  return mu < muH ? vec3(0.0) : texture2D(tTransmittance, transUv(r, mu)).rgb;
}
void main() {
  float muS = vUv.x * 2.0 - 1.0;
  float r = RG + clamp(vUv.y, 0.002, 1.0) * (RT - RG);
  vec3 o = vec3(0.0, r, 0.0);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
  const int DIRS = 64;
  const int N = 24;
  const float albedo = 0.3;
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  for (int k = 0; k < DIRS; k++) {
    // Fibonacci sphere
    float z = 1.0 - (float(k) + 0.5) * 2.0 / float(DIRS);
    float a = float(k) * 2.39996323;
    float s = sqrt(max(0.0, 1.0 - z * z));
    vec3 d = vec3(s * cos(a), z, s * sin(a));
    float b = dot(o, d);
    float cT = (r - RT) * (r + RT), cG = (r - RG) * (r + RG);
    float tT = -b + sqrt(max(b * b - cT, 0.0));
    float dG = b * b - cG;
    bool ground = dG > 0.0 && (-b - sqrt(dG)) > 0.0;
    float tMax = ground ? (-b - sqrt(dG)) : tT;
    float dt = tMax / float(N);
    vec3 od = vec3(0.0);
    for (int i = 0; i < N; i++) {
      vec3 p = o + d * (float(i) + 0.5) * dt;
      float rr = length(p);
      vec3 dens = atmoDensity(rr - RG);
      vec3 ext = atmoExtinction(dens);
      vec3 Tv = exp(-(od + ext * dt * 0.5));
      vec3 sc = BR * dens.x + vec3(BM) * dens.y;
      vec3 Ts = transTop(rr, dot(p, sun) / rr);
      L2 += Tv * sc * Ts * dt / (4.0 * 3.14159265);
      fms += Tv * sc * dt;
      od += ext * dt;
    }
    if (ground) {
      vec3 pg = o + d * tMax;
      vec3 ng = normalize(pg);
      float mu = max(dot(ng, sun), 0.0);
      L2 += exp(-od) * transTop(RG + 0.01, dot(ng, sun)) * albedo / 3.14159265 * mu;
    }
  }
  // integrals against the isotropic phase over the sphere = plain averages over the directions
  L2 /= float(DIRS);
  fms /= float(DIRS);
  gl_FragColor = vec4(L2 / (1.0 - fms), 1.0);
}
