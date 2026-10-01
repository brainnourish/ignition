#include <packing>
uniform sampler2D tNoise;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uHasDepth;
uniform vec3 uBackCol;
varying vec2 vUv;
varying vec3 vAmb;
varying vec3 vDirect;
varying vec3 vL;
varying float vAlpha;
varying float vShade;
varying vec2 vCell;
varying float vViewZ;
varying float vSize;
varying float vBacklit;

float dens(vec2 uv) { return texture2D(tNoise, clamp(uv, 0.002, 0.998) * 0.25 + vCell * 0.25).r; }

void main() {
  float a = dens(vUv);
  if (a < 0.004) discard;
  // normal: a ball bulging toward the camera, bumped by the density texture
  vec2 q = (vUv - 0.5) * 2.0;
  float r2 = dot(q, q);
  vec3 n = vec3(q * 0.85, sqrt(max(1.0 - r2 * 0.72, 0.05)));
  float e = 0.012;
  vec2 g = vec2(dens(vUv + vec2(e, 0.0)) - dens(vUv - vec2(e, 0.0)), dens(vUv + vec2(0.0, e)) - dens(vUv - vec2(0.0, e)));
  n = normalize(n - vec3(g * 5.5, 0.0));
  // wrapped diffuse: smoke scatters broadly, but the side facing the fire must read as lit
  float ndl = dot(n, vL);
  float diff = pow(clamp(ndl * 0.55 + 0.45, 0.0, 1.0), 1.6);
  // self-shadow inside the sprite: density between this texel and the light (march along the projected direction)
  vec2 ld = vL.xy;
  float occ = 0.0;
  occ += dens(vUv + ld * 0.06);
  occ += dens(vUv + ld * 0.14);
  occ += dens(vUv + ld * 0.26);
  float inner = exp(-occ * 0.9 * max(0.2, 1.0 - vL.z));
  float shade = mix(1.0, diff * inner * 1.6, vShade);
  vec3 col = vAmb + vDirect * shade;
  // backlit: thin parts glow when the fire is behind the particle
  float thin = 1.0 - smoothstep(0.05, 0.6, a);
  col += uBackCol * vBacklit * (0.25 + thin * 1.5);
  float alpha = a * vAlpha;
  // soft particles: fade where the sprite pushes into the ground, pad or tower
  if (uHasDepth > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(tDepth, suv).r;
    float sceneZ = perspectiveDepthToViewZ(d, uNear, uFar);
    float dist = vViewZ - sceneZ;
    alpha *= clamp(dist / (vSize * 0.55 + 0.5), 0.0, 1.0);
  }
  alpha *= smoothstep(1.5, 12.0, -vViewZ);
  gl_FragColor = vec4(col * alpha, alpha); // premultiplied
}
