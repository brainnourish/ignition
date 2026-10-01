#include atmos.glsl
uniform vec3 uCenter;
uniform float uSunRadius;     // angular radius, radians
uniform float uSunRadiance;
varying vec3 vDir;
// Black space and the sun: a tiny hard-edged HDR disc, limb-darkened, dimmed and reddened by the
// air when seen through the limb. No glow is painted here; bloom makes the glare.
void main() {
  vec3 d = normalize(vDir);
  float c = dot(d, uSunDir);
  float ang = acos(clamp(c, -1.0, 1.0));
  float u = ang / uSunRadius;
  // edge antialiased over ~a third of a pixel-scale band
  float aa = fwidth(u) * 0.8;
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, u);
  vec3 col = vec3(0.0);
  if (disc > 0.0) {
    float mu = sqrt(max(0.0, 1.0 - u * u));
    float limb = 1.0 - 0.6 * (1.0 - mu);
    vec3 o = cameraPosition - uCenter;
    vec2 ta = raySphere(o, d, RT);
    vec3 T = vec3(1.0);
    if (ta.y > 0.0) {
      vec3 e = o + d * max(ta.x, 0.0);
      float r = length(e);
      T = transmittance(r, dot(e, d) / r);
      T.b = min(T.b, T.g);   // see sunTransmittance(): keep the grazing sun orange, not magenta
    }
    col = vec3(1.0, 0.985, 0.96) * uSunRadiance * limb * disc * T;
  }
  gl_FragColor = vec4(col, 1.0);
}
