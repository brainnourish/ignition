uniform vec2 uHeatPos;
uniform vec2 uHeatSize;
uniform float uHeatStrength;
uniform float uFlash;
uniform vec3 uFlashCol;
uniform sampler2D tAdapt;
uniform float uBase;
uniform float uRef;
uniform float uStrength;
uniform float uMaxDrop;
uniform float uCompensation;
uniform float uCeiling;

float hhash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hhash(i), hhash(i + vec2(1.0, 0.0)), f.x),
             mix(hhash(i + vec2(0.0, 1.0)), hhash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// heat shimmer: an ellipse hanging below the engines, strongest just under the bells,
// never reaching up over the vehicle
void mainUv(inout vec2 uv) {
  vec2 d = uv - uHeatPos;
  d.x *= aspect;
  vec2 e = vec2(d.x / uHeatSize.x, (d.y + uHeatSize.y * 0.8) / uHeatSize.y);
  float m = smoothstep(1.0, 0.15, length(e)) * smoothstep(0.0, -0.04, d.y) * uHeatStrength;
  if (m > 0.0005) {
    float n1 = hnoise(uv * vec2(34.0, 18.0) + vec2(0.0, -time * 4.5)) - 0.5;
    float n2 = hnoise(uv * vec2(23.0, 41.0) + vec2(time * 1.3, -time * 6.5)) - 0.5;
    uv += vec2(n1, n2) * 0.012 * m;
  }
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // measured exposure: the night reference is exposed at uBase; anything brighter pulls exposure
  // down by uStrength stops per metered stop. Never brighter than the reference: dark stays dark.
  float over = clamp(texture2D(tAdapt, vec2(0.5)).r - uRef, 0.0, uMaxDrop / max(uStrength, 1e-3));
  float exposure = uBase * exp2(-uStrength * over) * uCompensation;
  vec3 c = inputColor.rgb * exposure;
  // veiling glare at ignition: light scattered inside the lens, lifts the blacks without erasing the image
  c += uFlashCol * uFlash * 0.06;
  // ceiling: anything past it is white after tone mapping anyway; capping here keeps a tiny HDR
  // source (the sun) a hard-edged disc instead of letting its energy bloom into a ball
  c = min(c, vec3(uCeiling));
  outputColor = vec4(c, inputColor.a);
}
