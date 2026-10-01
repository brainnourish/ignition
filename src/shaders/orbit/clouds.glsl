// Layered relief clouds: a thickness heightfield over the planet, marched from the view ray.
// Requires atmos.glsl (RG, uSunDir) and the uniforms below.
uniform sampler2D tClouds;      // global coverage (low resolution, real distribution)
uniform samplerCube tCloudCube; // baked: R coverage, G conservative top bound, B combined coverage
uniform highp sampler3D tNoise3;
uniform mat3 uEarthRotT;        // world -> Earth-fixed local
uniform float uCloudShift;
uniform float uCloudBase;       // km
uniform float uCloudMax;        // km of maximum thickness
uniform float uCloudBaseline;   // background cumulus coverage where the map is clear
uniform vec4 uFlash[3];         // lightning: local dir (xyz), intensity (w)
uniform float uPixelAngle;       // radians per drawing-buffer pixel (for detail LOD)
float gFootprint = 0.0;          // km per pixel at the current sample (set by the marcher)

vec2 dirToUv(vec3 d) {
  return vec2(atan(-d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
}
// coverage from the baked cube: one fetch, no trigonometry
float coverageAt(vec3 ld) { return texture(tCloudCube, ld).r; }
// thickness in km at an Earth-fixed direction; lod drops the finest octave for far/shadow samples
float cloudThick(vec3 ld, float lod) {
  // combined coverage (real map + background cumulus fields), baked with the large octaves
  float c = texture(tCloudCube, ld).b;
  if (c < 0.01) return 0.0;
  vec3 q = ld * RG;
  vec2 n1 = texture(tNoise3, q / 95.0).rg;
  // octaves finer than ~2 pixels fade to their mean: distant cumulus become haze, not speckle
  float f3 = 1.0 - smoothstep(1.5, 4.0, gFootprint);
  float f4 = 1.0 - smoothstep(0.4, 1.0, gFootprint);
  float n2 = texture(tNoise3, q / 23.0 + 0.31).r;
  float n3 = f3 > 0.0 ? mix(0.5, texture(tNoise3, q / 5.7 + 0.73).r, f3) : 0.5;
  float n4 = (lod < 0.5 && f4 > 0.0) ? mix(0.5, texture(tNoise3, q / 1.45 + 0.17).g, f4) : 0.5;
  // small cumulus thin out with distance (sub-pixel there) instead of aliasing
  c *= 1.0 - smoothstep(0.5, 2.2, gFootprint) * 0.75 * (1.0 - texture(tCloudCube, ld).r);
  float shape = n1.r * 0.45 + n2 * 0.32 + n3 * 0.16 + n4 * 0.07;
  float d = clamp((shape - (1.0 - c)) / max(c, 0.08), 0.0, 1.0);
  // erode the edges with the wispy channel so borders fray instead of ending in a line
  d = max(d - (1.0 - n1.g) * 0.18 * (1.0 - d), 0.0);
  // towers where the deck is thick and coverage is high; thin sheets elsewhere
  return d * uCloudMax * (0.15 + 0.85 * c * c) * (0.6 + 0.8 * n2);
}

// cheap conservative estimate (baked): true thickness <= this, with a margin for texel filtering
float cloudThickCoarse(vec3 ld) {
  float b = texture(tCloudCube, ld).g;
  return b > 0.0 ? b * uCloudMax * 1.4 * 1.15 + 0.3 : 0.0;
}

struct CloudHit { float t; float alpha; vec3 p; vec3 ld; float thick; float h; };

// march the view ray o + d t (world, relative to the Earth centre) through the cloud shell, up to tGround
CloudHit marchClouds(vec3 o, vec3 d, float tGround) {
  CloudHit ch; ch.t = tGround; ch.alpha = 0.0; ch.p = vec3(0.0); ch.ld = vec3(0.0, 1.0, 0.0); ch.thick = 0.0; ch.h = 0.0;
  vec2 ts = raySphere(o, d, RG + uCloudBase + uCloudMax);
  if (ts.y < 0.0) return ch;
  float t0 = max(ts.x, 0.0), t1 = tGround;
  vec2 tb = raySphere(o, d, RG + uCloudBase - 0.3);
  if (tb.y > 0.0 && tb.x > t0) t1 = min(t1, tb.x);   // below the cloud base nothing can be hit
  if (t1 <= t0) return ch;
  float len = t1 - t0;
  int n = int(clamp(len / 4.0, 5.0, 22.0));
  float dt = len / float(n);
  float jit = atmoHash(gl_FragCoord.xy + 7.1);
  float prevT = t0;
  for (int i = 0; i < 22; i++) {
    if (i >= n) break;
    float t = t0 + (float(i) + jit) * dt;
    gFootprint = t * uPixelAngle;
    vec3 p = o + d * t;
    float r = length(p);
    float a = r - RG;
    vec3 ld = uEarthRotT * (p / r);
    if (a > uCloudBase + cloudThickCoarse(ld)) { prevT = t; continue; }
    float th = cloudThick(ld, 0.0);
    if (th > 0.02 && a < uCloudBase + th && a > uCloudBase - 0.3) {
      // refine between the previous sample and this one
      float lo = prevT, hi = t;
      for (int k = 0; k < 2; k++) {
        float m = 0.5 * (lo + hi);
        vec3 pm = o + d * m; float rm = length(pm);
        vec3 lm = uEarthRotT * (pm / rm);
        if (rm - RG < uCloudBase + cloudThick(lm, 0.0)) hi = m; else lo = m;
      }
      ch.t = hi;
      ch.p = o + d * hi;
      float rh = length(ch.p);
      ch.ld = uEarthRotT * (ch.p / rh);
      ch.thick = cloudThick(ch.ld, 0.0);
      ch.h = rh - RG;
      // thin cloud is translucent: wisps and sheet edges let the ground through
      ch.alpha = 1.0 - exp(-ch.thick * 1.6);
      return ch;
    }
    prevT = t;
  }
  return ch;
}

// transmittance of the cloud layer along the sun ray from a ground/cloud point (world, centred)
float cloudShadow(vec3 p, float lod) {
  vec3 up = normalize(p);
  float muS = dot(up, uSunDir);
  if (muS <= 0.0) return 1.0;
  float h = uCloudBase + 1.5;
  float a = length(p) - RG;
  float dist = max(h - a, 0.0) / max(muS, 0.06);
  vec3 q = p + uSunDir * dist;
  // the real cloud shape (minus the finest octave): cumulus shadows need their own outlines
  float th = cloudThick(uEarthRotT * normalize(q), lod);
  return exp(-th * 0.9);
}
