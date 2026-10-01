#include noise.glsl
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform float uExpand;
uniform float uFall;
uniform float uBright;
uniform float uIntensity;
uniform float uDiamonds;
uniform float uCoreLen;
uniform vec3 uCoreCol;
uniform vec3 uBodyCol;
uniform vec3 uEdgeCol;
varying vec2 vUv;
void main() {
  float x = (vUv.x * 2.0 - 1.0) * 1.35;
  float y = vUv.y;
  float n = fbm3(vec3(x * 1.4, y * 4.5 - uTime * 4.2, uSeed * 7.0 + uTime * 0.6)) - 0.5;
  float n2 = vnoise3(vec3(x * 5.0, y * 16.0 - uTime * 9.0, uSeed * 3.0)) - 0.5;
  float w = mix(0.42, 1.0, pow(y, 0.65)) * uExpand;
  w *= 1.0 + (0.42 * n + 0.14 * n2) * smoothstep(0.0, 0.45, y);
  float r = abs(x) / max(w, 0.02);
  float body = pow(smoothstep(1.0, 0.0, r), 1.7);
  // turbulent break-up toward the tail
  float brk = fbm3(vec3(x * 2.2, y * 7.0 - uTime * 5.0, uSeed * 5.0 + 2.0));
  body *= mix(1.0, clamp(0.25 + brk * 1.5, 0.0, 1.4), smoothstep(0.15, 0.9, y));
  float core = exp(-r * r * 6.5) * (1.0 - smoothstep(0.0, uCoreLen, y));
  float mach = pow(max(sin(y * uDiamonds * 6.2832 - 1.5708), 0.0), 10.0)
             * exp(-r * r * 12.0) * (1.0 - smoothstep(0.02, 0.5, y)) * smoothstep(0.0, 0.03, y);
  float fall = pow(1.0 - y, uFall);
  float flick = 0.94 + 0.12 * (vnoise3(vec3(uTime * 7.0, uSeed * 11.0, y * 1.5)) - 0.5);
  float wisp = 0.75 + 0.5 * fbm3(vec3(x * 3.0, y * 9.0 - uTime * 6.0, uSeed + 4.0));
  float inner = pow(body, 3.0);
  vec3 col = uEdgeCol * body * (1.0 - inner) * wisp * 0.9
           + uBodyCol * inner * 1.6
           + uCoreCol * core * 3.2
           + vec3(1.3, 1.15, 1.0) * mach * 4.0;
  col *= fall * uPower * uBright * flick * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
