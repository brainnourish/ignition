uniform float uDim;
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.62, 0.6, 0.58) * a * vBright * uDim, 1.0);
}
