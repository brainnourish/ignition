// Eye adaptation: the adapted log2 luminance chases the metered value, faster toward bright.
uniform sampler2D tTarget;
uniform sampler2D tPrev;
uniform float uDt;
uniform float uUp;
uniform float uDown;
uniform float uReset;
uniform float uHighlight;
varying vec2 vUv;
void main() {
  vec3 t = texture2D(tTarget, vec2(0.5)).rgb;
  float w = max(t.y, 1e-4);
  // blend the log average (robust) with the linear mean (reacts to a small, very bright fire)
  float target = mix(t.x / w, log2(t.z / w + 1e-5), uHighlight);
  float prev = texture2D(tPrev, vec2(0.5)).r;
  float rate = target > prev ? uUp : uDown;
  float a = uReset > 0.5 ? target : prev + (target - prev) * (1.0 - exp(-uDt * rate));
  gl_FragColor = vec4(a, target, 0.0, 1.0);
}
