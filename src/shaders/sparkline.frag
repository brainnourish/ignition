varying float vLife;
varying float vHead;
void main() {
  vec3 col = mix(vec3(1.0, 0.42, 0.10), vec3(1.6, 1.35, 1.0), smoothstep(0.2, 1.0, vLife));
  gl_FragColor = vec4(col * (0.3 + vLife) * 2.2 * vHead, 1.0);
}
