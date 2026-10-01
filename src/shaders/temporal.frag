uniform sampler2D tCur;
uniform sampler2D tPrev;
uniform float uBlend;
varying vec2 vUv;
void main() {
  gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tCur, vUv), uBlend);
}
