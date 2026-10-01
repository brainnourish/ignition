uniform sampler2D tScene;
uniform sampler2D tSmoke;
varying vec2 vUv;
void main() {
  vec4 scene = texture2D(tScene, vUv);
  vec4 smoke = texture2D(tSmoke, vUv);
  gl_FragColor = vec4(scene.rgb * (1.0 - smoke.a) + smoke.rgb, 1.0);
}
