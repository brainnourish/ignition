// Single-scattering atmosphere (km units, positions relative to the Earth's centre).
// Rayleigh + Mie + ozone absorption, sun transmittance from a precomputed LUT.
#ifndef PI
#define PI 3.141592653589793
#endif
#include atmoconst.glsl
uniform sampler2D tTransmittance;
uniform sampler2D tMultiScat;
uniform vec3 uSunDir;
uniform float uSunE;          // solar illuminance scale (pi = a white Lambert surface at noon reads 1.0)

// The three-channel ozone absorbs green more than red, so red sunlight plus Rayleigh blue comes out
// magenta at the limb, where real broadband absorption and a camera give blue-white. Remove only the
// magenta part (red and blue both above green): orange and pure blue are left alone.
vec3 limbGrade(vec3 c) {
  float m = max(min(c.r, c.b) - c.g, 0.0);
  return vec3(c.r - m, c.g + m * 0.45, c.b);
}

vec3 multiScat(float r, float muS) {
  return texture2D(tMultiScat, vec2(muS * 0.5 + 0.5, clamp((r - RG) / (RT - RG), 0.0, 1.0))).rgb;
}

// (near, far) intersections; far < 0 means a miss. Written to stay precise at planetary scale.
vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float L = length(o);
  float c = (L - r) * (L + r);
  float disc = b * b - c;
  if (disc < 0.0) return vec2(1e9, -1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

vec2 transUv(float r, float mu) {
  float x = 0.5 + 0.5 * sign(mu) * sqrt(abs(mu));
  float y = sqrt(clamp((r - RG) / (RT - RG), 0.0, 1.0));
  return vec2(x, y);
}
// transmittance from radius r along direction cosine mu to space (0 if the ground is in the way)
vec3 transmittance(float r, float mu) {
  // the geometric horizon at this radius, softened over the sun's own disc
  float muH = -sqrt(max(0.0, 1.0 - (RG * RG) / (r * r)));
  float vis = smoothstep(muH - 0.004, muH + 0.004, mu);
  return texture2D(tTransmittance, transUv(r, mu)).rgb * vis;
}

float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu) {
  const float g = 0.8;
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

float atmoHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// In-scattered radiance along o + d t, t in [atmosphere entry, tMax]; also returns the view transmittance.
vec3 inscatter(vec3 o, vec3 d, float tMax, out vec3 transView) {
  transView = vec3(1.0);
  vec2 ta = raySphere(o, d, RT);
  if (ta.y < 0.0) return vec3(0.0);
  float t0 = max(ta.x, 0.0), t1 = min(ta.y, tMax);
  if (t1 <= t0) return vec3(0.0);
  // fewer samples for short paths (looking down), more for long grazing ones (the limb)
  int N = int(clamp((t1 - t0) / 60.0, 8.0, 20.0));
  float dt = (t1 - t0) / float(N);
  // fixed mid-interval samples: per-pixel jitter reads as grain without temporal accumulation
  float jit = 0.5;
  vec3 od = vec3(0.0), sR = vec3(0.0), sM = vec3(0.0);
  float mu = dot(d, uSunDir);
  float phR = phaseR(mu), phM = phaseM(mu);
  for (int i = 0; i < 20; i++) {
    if (i >= N) break;
    float t = t0 + (float(i) + jit) * dt;
    vec3 p = o + d * t;
    float r = length(p);
    vec3 dens = atmoDensity(r - RG);
    vec3 ext = atmoExtinction(dens);
    vec3 Tv = exp(-(od + ext * dt * 0.5));
    float muS = dot(p, uSunDir) / r;
    vec3 Ts = transmittance(r, muS);
    vec3 ms = multiScat(r, muS);
    sR += Tv * (Ts * phR + ms) * dens.x;
    sM += Tv * (Ts * phM + ms) * dens.y;
    od += ext * dt;
  }
  transView = exp(-od);
  return (sR * BR + sM * BM) * dt * uSunE;
}
