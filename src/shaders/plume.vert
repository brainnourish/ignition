uniform vec3 uOrigin;
uniform vec3 uAxis;
uniform float uLen;
uniform float uWidth;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 toCam = cameraPosition - uOrigin;
  vec3 right = cross(uAxis, toCam);
  float rl = length(right);
  right = rl > 1e-4 ? right / rl : vec3(1.0, 0.0, 0.0);
  float x = (uv.x - 0.5) * 2.0;
  // widen the quad so turbulent edges have room
  vec3 world = uOrigin + uAxis * (uv.y * uLen) + right * (x * uWidth * 1.35);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
