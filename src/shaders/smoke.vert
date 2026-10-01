attribute vec3 aOffset;
attribute float aSize;
attribute float aRot;
attribute vec3 aAmb;
attribute vec3 aDirect;
attribute vec3 aLightDir;
attribute float aAlpha;
attribute float aCell;
attribute float aShade;
attribute float aBacklit;
varying vec2 vUv;
varying vec3 vAmb;
varying vec3 vDirect;
varying vec3 vL;          // light direction in the sprite's own frame (x,y in the quad plane, z toward camera)
varying float vAlpha;
varying float vShade;
varying vec2 vCell;
varying float vViewZ;
varying float vSize;
varying float vBacklit;
void main() {
  vec4 mvCenter = modelViewMatrix * vec4(aOffset, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 p = position.xy;
  vec2 pr = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * aSize;
  vec4 mv = mvCenter + vec4(pr, 0.0, 0.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vAmb = aAmb;
  vDirect = aDirect;
  vAlpha = aAlpha;
  vShade = aShade;
  vSize = aSize;
  vViewZ = mv.z;
  vBacklit = aBacklit;
  vCell = vec2(mod(aCell, 4.0), floor(aCell / 4.0));
  // light direction: world -> view, then un-rotate into the sprite frame so it matches the texture
  vec3 lv = normalize(mat3(viewMatrix) * aLightDir + vec3(0.0, 0.0, 1e-4));
  vL = vec3(c * lv.x + s * lv.y, -s * lv.x + c * lv.y, lv.z);
}
