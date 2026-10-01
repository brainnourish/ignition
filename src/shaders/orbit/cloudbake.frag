// Bakes, per Earth-fixed direction: R = cloud coverage, G = conservative cloud-top bound (fraction of 1.4 x max).
#ifndef PI
#define PI 3.141592653589793
#endif
const float RG = 6371.0;
uniform sampler2D tClouds;
uniform highp sampler3D tNoise3;
uniform float uCloudShift;
uniform float uCloudBaseline;
uniform vec4 uStorm[4];          // thunderstorm clusters: Earth-fixed direction, angular radius
varying vec3 vDir;
vec2 dirToUv(vec3 d) { return vec2(atan(-d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5); }
void main() {
  vec3 ld = normalize(vDir);
  vec2 uv = dirToUv(ld);
  uv.x = fract(uv.x + uCloudShift);
  // a small blur of the 20 km coverage map: bilinear texels through a sharp threshold read as diamonds
  vec2 px = vec2(1.0 / 2048.0, 1.0 / 1024.0) * 0.9;
  float raw = texture2D(tClouds, uv).r * 0.36
            + (texture2D(tClouds, uv + vec2(px.x, 0.0)).r + texture2D(tClouds, uv - vec2(px.x, 0.0)).r
             + texture2D(tClouds, uv + vec2(0.0, px.y)).r + texture2D(tClouds, uv - vec2(0.0, px.y)).r) * 0.16;
  float cov = smoothstep(0.12, 0.8, raw);
  vec3 q = ld * RG;
  float r1 = texture(tNoise3, q / 95.0).r;
  float syn = texture(tNoise3, q / 450.0 + 0.53).r;
  // convective clusters: dense, tall, ragged at the edges
  float storm = 0.0;
  for (int k = 0; k < 4; k++) {
    if (uStorm[k].w > 0.0) {
      float a = acos(clamp(dot(ld, uStorm[k].xyz), -1.0, 1.0));
      storm = max(storm, smoothstep(uStorm[k].w, uStorm[k].w * 0.35, a + (r1 - 0.5) * uStorm[k].w * 0.6));
    }
  }
  cov = max(cov, storm * 0.92);
  float c = max(cov, uCloudBaseline * smoothstep(0.3, 0.7, r1) * smoothstep(0.3, 0.72, syn));
  float shape = r1 * 0.45 + 0.55;
  float d = c < 0.01 ? 0.0 : clamp((shape - (1.0 - c)) / max(c, 0.08), 0.0, 1.0);
  float bound = d * (0.15 + 0.85 * c * c);
  gl_FragColor = vec4(cov, bound, c, 1.0);
}
