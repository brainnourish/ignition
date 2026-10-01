#include ../noise.glsl
#include atmos.glsl
#include clouds.glsl
uniform sampler2D tDay;
uniform sampler2D tNight;
uniform sampler2D tBump;
uniform vec3 uCenter;
uniform mat3 uEarthRot;       // local (texture) frame -> world
uniform vec2 uBumpTexel;
uniform float uBumpStrength;
uniform float uCityGain;
uniform vec3 uCityCol;
uniform float uGlintRough;
uniform vec3 uSeaColor;
uniform float uNightGlow;
#ifdef TILE
uniform sampler2D tLand;      // Landsat WELD (land detail), per tile
uniform vec4 uLandXf;         // scale.xy, offset.zw into the (possibly ancestor) texture
uniform float uHasLand;
uniform sampler2D tBase;      // Blue Marble NG (water, gaps)
uniform vec4 uBaseXf;
uniform sampler2D tNightT;    // Black Marble
uniform vec4 uNightXf;
uniform sampler2D tMask;      // MODIS water mask (alpha: 1 water, 0 land; lakes included)
uniform vec4 uMaskXf;
uniform float uHasMask;
uniform sampler2D tHeight;    // terrain heights (km), AWS Terrain Tiles
uniform vec4 uHeightXf;
uniform float uHasHeight;
uniform float uHeightTexelKm; // km per height texel at the equator
uniform float uReliefExag;
#endif
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vLocalN;
varying vec3 vIns;
varying vec3 vTv;

// linear albedo: water is dark and blue-dominant (Blue Marble oceans, lakes)
float waterMask(vec3 c) {
  float ratio = (c.b + 0.004) / (c.r + 0.004);
  return smoothstep(1.35, 2.2, ratio) * (1.0 - smoothstep(0.05, 0.12, dot(c, vec3(0.33))));
}

vec3 skyAmbient(float muS) {
  // light from the whole sky dome on a horizontal surface: blue, following the sun into twilight
  return vec3(0.045, 0.075, 0.14) * smoothstep(-0.12, 0.35, muS) + vec3(0.02, 0.012, 0.006) * smoothstep(-0.12, 0.0, muS) * (1.0 - smoothstep(0.0, 0.2, muS));
}

void main() {
  vec3 p = vWorld - uCenter;
  vec3 n0 = normalize(p);
  vec3 v = normalize(cameraPosition - vWorld);
#ifdef TILE
  vec2 uv = dirToUv(normalize(vLocalN));   // global equirect coordinates (bump map)
#else
  vec2 uv = vUv;
#endif

  // ---- relief from the bump map, in the sphere's tangent frame (east / north in world space)
  vec3 ln = normalize(vLocalN);
  vec3 eastL = normalize(cross(vec3(0.0, 1.0, 0.0), ln) + vec3(1e-6, 0.0, 0.0));
  vec3 northL = cross(ln, eastL);
  float hL = texture2D(tBump, uv - vec2(uBumpTexel.x, 0.0)).r;
  float hR = texture2D(tBump, uv + vec2(uBumpTexel.x, 0.0)).r;
  float hD = texture2D(tBump, uv - vec2(0.0, uBumpTexel.y)).r;
  float hU = texture2D(tBump, uv + vec2(0.0, uBumpTexel.y)).r;
  vec3 east = uEarthRot * eastL, north = uEarthRot * northL;
  vec3 n = normalize(n0 + (east * (hL - hR) + north * (hD - hU)) * uBumpStrength);
  float terrainShadow = 1.0;
#ifdef TILE
  if (uHasHeight > 0.5) {
    // real relief: normals from the elevation tile, in true metres per texel at this latitude
    vec2 huv = vUv * uHeightXf.xy + uHeightXf.zw;
    float texelKm = uHeightTexelKm * max(length(ln.xz), 0.05) * uHeightXf.x;   // one tile-uv texel
    vec2 du = vec2(uHeightXf.x / 256.0, 0.0), dv = vec2(0.0, uHeightXf.x / 256.0);
    float h0 = texture2D(tHeight, huv).r;
    float gE = (texture2D(tHeight, huv + du).r - texture2D(tHeight, huv - du).r) / (2.0 * texelKm);
    float gN = (texture2D(tHeight, huv - dv).r - texture2D(tHeight, huv + dv).r) / (2.0 * texelKm);
    n = normalize(n0 - (east * gE + north * gN) * uReliefExag);
    // cast shadows: walk the heightfield toward the sun (only matters when it is low)
    float sE = dot(uSunDir, east), sN = dot(uSunDir, north);
    float hor = length(vec2(sE, sN));
    float muS0 = dot(n0, uSunDir);
    if (muS0 > -0.02 && muS0 < 0.55 && hor > 1e-3) {
      vec2 dir = vec2(sE, -sN) / hor;          // in uv: v runs south
      float tanE = muS0 / hor;
      float vis = 1.0, dist = 0.0, stepT = 1.2;
      for (int k = 0; k < 14; k++) {
        dist += stepT;
        float dKm = dist * texelKm;
        float hs = texture2D(tHeight, huv + dir * dist * du.x).r;
        float rayH = (h0 + dKm * tanE / uReliefExag) ;
        // penumbra: the sun is half a degree wide
        vis = min(vis, clamp(0.5 + (rayH - hs) / max(dKm * 0.0093, 0.004), 0.0, 1.0));
        stepT *= 1.32;
      }
      terrainShadow = vis;
    }
  }
#endif

  // ---- sunlight at the ground, already reddened by its path through the air
  float muS = dot(n0, uSunDir);
  vec3 Ts = transmittance(RG + 0.05, muS);
  Ts.b = min(Ts.b, Ts.g);
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 sky = skyAmbient(muS);
#ifdef TILE
  vec3 baseCol = texture2D(tBase, vUv * uBaseXf.xy + uBaseXf.zw).rgb;
  // water from the MODIS mask where we have it, colour otherwise
  float sea = uHasMask > 0.5 ? texture2D(tMask, vUv * uMaskXf.xy + uMaskXf.zw).a : waterMask(baseCol);
  // without a water mask, never trust Landsat (its scenes over the sea carry ice and cloud)
  // ... nor with a mask much coarser than the tile (a zoom-3 ancestor calls whole seas "land")
  float landOk = uHasMask * step(0.124, uMaskXf.x);
  vec3 albedo = baseCol;
  float lake = 0.0;
  if (uHasLand > 0.5 && landOk > 0.5) {
    vec3 landCol = texture2D(tLand, vUv * uLandXf.xy + uLandXf.zw).rgb;
    // WELD is black where it has no data: fall back to Blue Marble there
    float valid = smoothstep(0.004, 0.02, dot(landCol, vec3(0.33)));
    albedo = mix(baseCol, landCol, valid * (1.0 - sea));
    lake = uHasMask > 0.5 ? 0.0 : waterMask(landCol) * valid * (1.0 - sea);   // the MODIS mask already has the lakes
  }
  float waterAmt = max(sea, lake);
  // open sea: a dark navy with only a clamped tint from Blue Marble (its polar seas carry ice swaths)
  vec3 seaTint = min(baseCol, vec3(0.03, 0.05, 0.08));
  albedo = mix(albedo, mix(uSeaColor, seaTint, 0.45), sea);
#else
  vec3 albedo = texture2D(tDay, uv).rgb;
  float waterAmt = waterMask(albedo);
  // same open-sea treatment as the tiles, so a gap between tiles never shows a different ocean
  albedo = mix(albedo, mix(uSeaColor, min(albedo, vec3(0.03, 0.05, 0.08)), 0.45), waterAmt);
#endif
  gFootprint = length(vWorld - cameraPosition) * uPixelAngle;
  float shadow = cloudShadow(p, 1.0);

  // ---- water: deep, dark, with a sun glint (Beckmann lobe), land stays matte
  float water = waterAmt;
  vec3 ground = albedo * ndl * Ts * uSunE / PI * shadow * terrainShadow + albedo * sky;
  vec3 h = normalize(uSunDir + v);
  float ndh = clamp(dot(n0, h), 0.05, 1.0);
  // sea state: wind fields (~150 km) and calm slicks (~15 km streaks) change the surface roughness;
  // calm water gives a small, sharp, bright glint, rough water a broad dim one (energy conserving)
  vec3 lq = uEarthRotT * n0 * RG;
  float wind = texture(tNoise3, lq / 160.0 + 0.21).r;
  float slick = smoothstep(0.62, 0.8, texture(tNoise3, vec3(lq.x / 9.0, lq.y / 40.0, lq.z / 9.0) + 0.47).g);
  float rough = uGlintRough * mix(0.55, 1.6, wind) * mix(1.0, 0.45, slick);
  float m2 = rough * rough;
  float cos2 = ndh * ndh;
  float beck = exp((cos2 - 1.0) / (m2 * cos2)) / (PI * m2 * cos2 * cos2);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(h, v), 0.0), 5.0);
  float ndv = max(dot(n0, v), 0.02);
  vec3 spec = Ts * uSunE / PI * beck * fres / (4.0 * ndv) * step(0.0, muS);
  vec3 seaSky = vec3(0.06, 0.1, 0.2) * smoothstep(-0.1, 0.3, muS) * (0.02 + 0.98 * pow(1.0 - ndv, 5.0));
  ground += water * (spec * PI * shadow + seaSky);

  // night ground: airglow and starlight leave the land and sea just readable (as in ISS night photos)
  ground += albedo * uNightGlow * (1.0 - smoothstep(-0.12, 0.0, muS));
  // ---- city lights (Black Marble), sodium orange; only where it is dark
#ifdef TILE
  vec3 night = texture2D(tNightT, vUv * uNightXf.xy + uNightXf.zw).rgb;
#else
  vec3 night = texture2D(tNight, uv).rgb;
#endif
  float lum = dot(night, vec3(0.3, 0.59, 0.11));
  float lights = max(lum - 0.05, 0.0) / 0.95;
  float dark = 1.0 - smoothstep(-0.12, 0.02, muS);
  ground += uCityCol * pow(lights, 1.6) * uCityGain * dark;

  // ---- clouds: relief-marched heightfield, lit and self-shadowed
  vec3 o = cameraPosition - uCenter;
  vec3 d = -v;
  float tGround = length(vWorld - cameraPosition);
  CloudHit ch = marchClouds(o, d, tGround);
  vec3 col = ground;
  float tAir = tGround;
  if (ch.alpha > 0.001) {
    vec3 up = normalize(ch.p);
    // heightfield normal: finite differences along the local tangent directions
    vec3 lup = ch.ld;
    vec3 le = normalize(cross(vec3(0.0, 1.0, 0.0), lup) + vec3(1e-6, 0.0, 0.0));
    vec3 lnn = cross(lup, le);
    float e = 0.6;   // km
    // one-sided differences against the hit (saves two full evaluations)
    float tx = (cloudThick(normalize(lup + le * (e / RG)), 0.0) - ch.thick) * 2.0;
    float ty = (cloudThick(normalize(lup + lnn * (e / RG)), 0.0) - ch.thick) * 2.0;
    vec3 we = uEarthRot * le, wn = uEarthRot * lnn;
    vec3 cn = normalize(up - (we * tx + wn * ty) / (2.0 * e) * 0.9);
    float cmuS = dot(up, uSunDir);
    vec3 cTs = transmittance(RG + ch.h, cmuS);
    cTs.b = min(cTs.b, cTs.g);
    // self-shadow: step toward the sun and see whether the cloud rises above the ray
    float occ = 0.0;
    float stepLen = 1.0;
    vec3 sp = ch.p;
    for (int k = 0; k < 4; k++) {
      sp += uSunDir * stepLen;
      float rs = length(sp);
      float th = cloudThickCoarse(uEarthRotT * (sp / rs)) * 0.55;   // soft: the baked large-scale shape
      occ += max(uCloudBase + th - (rs - RG), 0.0) * stepLen;
      stepLen *= 1.9;
    }
    float selfShadow = exp(-occ * 0.35);
    float wrap = clamp(dot(cn, uSunDir) * 0.6 + 0.4, 0.0, 1.0);
    // lower parts of a tower sit in its own shade (darker undersides, shaded walls)
    float heightInCloud = clamp((ch.h - uCloudBase) / max(ch.thick, 0.1), 0.0, 1.0);
    float ao = mix(0.45, 1.0, heightInCloud);
    // silver lining: thin edges glow when looking toward the sun
    float toward = pow(max(dot(-v, uSunDir), 0.0), 8.0);
    vec3 cloudCol = vec3(0.95) * cTs * uSunE / PI * (wrap * selfShadow * mix(0.85, 1.0, heightInCloud) + toward * (1.0 - ch.alpha) * 2.0)
                  + vec3(0.9) * skyAmbient(cmuS) * 1.5 * ao;
    // lightning inside clouds on the night side
    for (int k = 0; k < 3; k++) {
      if (uFlash[k].w > 0.0) {
        float dk = length(ch.ld - uFlash[k].xyz) * RG;
        cloudCol += vec3(0.75, 0.82, 1.0) * uFlash[k].w * exp(-dk * dk / 900.0) * (0.4 + 0.6 * clamp(ch.thick / 4.0, 0.0, 1.0));
      }
    }
    col = mix(ground, cloudCol, ch.alpha);
    tAir = mix(tGround, ch.t, ch.alpha);
  }

  // ---- aerial perspective: the air between the window and whatever was hit.
  // Per vertex where it varies slowly; per pixel only in the grazing band near the horizon.
  vec3 Tv = vTv, ins = vIns;
  float grazing = 1.0 - smoothstep(0.12, 0.28, dot(v, n0));
  if (grazing > 0.0) {
    vec3 Tp;
    vec3 ip = inscatter(o, d, tAir, Tp);
    ins = mix(ins, ip, grazing);
    Tv = mix(Tv, Tp, grazing);
  }
  vec3 outc = col * Tv + ins;
  gl_FragColor = vec4(max(outc, vec3(0.0)), 1.0);
}
