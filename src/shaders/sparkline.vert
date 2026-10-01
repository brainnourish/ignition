attribute float aLife;
attribute float aHead;
varying float vLife;
varying float vHead;
void main() {
  vLife = aLife;
  vHead = aHead;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
