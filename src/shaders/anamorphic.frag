uniform sampler2D tStreak;
uniform float uStrength;
uniform vec3 uTint;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 streak = texture2D(tStreak, uv).rgb * uTint * uStrength;
  outputColor = vec4(inputColor.rgb + streak, inputColor.a);
}
