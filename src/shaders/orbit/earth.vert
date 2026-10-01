#include atmos.glsl
uniform vec3 uCenter;
varying vec3 vWorld;
varying vec2 vUv;
varying vec3 vLocalN;
varying vec3 vIns;       // aerial perspective, evaluated per vertex (it varies slowly away from the horizon)
varying vec3 vTv;
void main() {
  vUv = uv;
  vLocalN = normalize(normal);   // unit direction in the planet's frame (sphere and tiles alike)
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec3 o = cameraPosition - uCenter;
  vec3 d = w.xyz - cameraPosition;
  float t = length(d);
  vIns = inscatter(o, d / t, t, vTv);
  gl_Position = projectionMatrix * viewMatrix * w;
}
