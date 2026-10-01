uniform mat4 uPrevVP;
uniform mat4 uInvVP;
uniform float uStrength;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength < 0.001) { outputColor = inputColor; return; }
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 p = uInvVP * vec4(ndc, 1.0, 1.0);
  p /= p.w;
  vec4 q = uPrevVP * p;
  vec2 prev = q.xy / q.w;
  vec2 delta = (prev - ndc) * 0.5 * uStrength;
  float len = length(delta);
  delta = len > 0.03 ? delta * (0.03 / len) : delta;
  vec3 acc = inputColor.rgb;
  for (int i = 1; i < 8; i++) {
    float t = float(i) / 8.0;
    acc += texture2D(inputBuffer, uv + delta * t).rgb;
  }
  outputColor = vec4(acc / 8.0, inputColor.a);
}
