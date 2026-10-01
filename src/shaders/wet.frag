#include noise.glsl
uniform sampler2D tReflect;
uniform float uStrength;
uniform float uTime;
uniform float uMaxLod;
varying vec4 vRefl;
varying vec3 vWorld;
// Wet concrete: puddles give a sharp, rippled mirror; the damp surface around them a smeared one.
void main() {
  vec2 xz = vWorld.xz;
  // puddle mask: large low-frequency pools, broken at the edges
  float pool = fbm3(vec3(xz * 0.021, 1.7)) + (vnoise3(vec3(xz * 0.11, 4.2)) - 0.5) * 0.18;
  float puddle = smoothstep(0.50, 0.56, pool);
  float damp = 0.55 + 0.45 * smoothstep(0.3, 0.5, pool);
  // ripples: slow, small; plus static surface grain in the damp areas
  vec2 rip = vec2(vnoise3(vec3(xz * 0.9, uTime * 0.35)), vnoise3(vec3(xz * 0.9 + 17.0, uTime * 0.35))) - 0.5;
  vec2 grain = vec2(vnoise3(vec3(xz * 3.1, 2.0)), vnoise3(vec3(xz * 3.1, 9.0))) - 0.5;
  vec3 v = normalize(cameraPosition - vWorld);
  // Fresnel for water (F0 = 0.02) at the viewing angle
  float cosT = clamp(v.y, 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec2 uv = vRefl.xy / vRefl.w;
  float rough = mix(0.8, 0.06, puddle);
  // smearing is mostly vertical on wet ground (streaks toward the viewer)
  vec2 off = (rip * mix(0.004, 0.0025, puddle) + grain * 0.012 * (1.0 - puddle));
  float lod = rough * uMaxLod;
  vec3 c = vec3(0.0);
  c += textureLod(tReflect, uv + off, lod).rgb * 0.4;
  c += textureLod(tReflect, uv + off + vec2(0.0, 0.006 * rough), lod).rgb * 0.2;
  c += textureLod(tReflect, uv + off - vec2(0.0, 0.006 * rough), lod).rgb * 0.2;
  c += textureLod(tReflect, uv + off + vec2(0.0, 0.016 * rough), lod + 0.5).rgb * 0.1;
  c += textureLod(tReflect, uv + off - vec2(0.0, 0.016 * rough), lod + 0.5).rgb * 0.1;
  float k = fres * mix(0.35, 1.0, puddle) * damp * uStrength;
  // fade out toward the plane edges
  k *= 1.0 - smoothstep(420.0, 600.0, length(xz - cameraPosition.xz));
  gl_FragColor = vec4(c * k, 1.0);
}
