uniform sampler2D tSmudge;
uniform vec3 uSunDir;
uniform vec3 uSunCol;        // sunlight reaching the glass (0 when the sun is behind the planet)
uniform vec3 uEarthCol;      // earthshine arriving through the window
uniform vec3 uInterior;      // how lit the cabin is (for the faint reflection of the interior)
uniform vec3 uLedPos;
uniform vec3 uLedCol;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
// Window glass: nearly invisible. Smudges and dust only show when light rakes through them, and the
// lit cabin reflects faintly at the edges (Fresnel). Additive.
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNormal);
  if (dot(n, v) < 0.0) n = -n;
  vec2 suv = vUv * 0.9 + uSeed * 0.37;
  float smudge = texture2D(tSmudge, suv).r;
  float dust = texture2D(tSmudge, suv * 2.3 + 0.5).g;
  // forward scattering: sunlight passing through the pane toward the eye lights the smudges up
  float toward = max(dot(-v, uSunDir), 0.0);
  // broad lobe only: no painted halo around the sun, bloom makes the glare
  float fwd = 0.002 + 0.03 * pow(toward, 10.0);
  vec3 col = uSunCol * (smudge * 0.5 + dust * 0.25) * fwd;
  col += uEarthCol * (smudge * 0.04 + dust * 0.01);
  // Fresnel reflection of the (dim) interior, strongest toward the rim of the pane
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float rim = smoothstep(0.25, 0.5, length(vUv - 0.5));
  col += uInterior * fres * (0.6 + 0.8 * rim) * (0.7 + 0.6 * smudge);
  // reflection of the indicator light in the pane
  vec3 r = reflect(-v, n);
  vec3 toLed = normalize(uLedPos - vWorld);
  col += uLedCol * pow(max(dot(r, toLed), 0.0), 900.0) * 0.6 * fres * 6.0;
  gl_FragColor = vec4(col, 1.0);
}
