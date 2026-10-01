varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  vec3 col = mix(vec3(1.0, 0.42, 0.10), vec3(1.6, 1.35, 1.0), smoothstep(0.2, 1.0, vLife));
  gl_FragColor = vec4(col * a * (0.3 + vLife) * 4.0, 1.0);
}
