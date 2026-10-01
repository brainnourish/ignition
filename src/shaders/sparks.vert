attribute float aLife;
attribute float aSize;
uniform float uPixelRatio;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (260.0 / max(-mv.z, 1.0)) * uPixelRatio;
}
