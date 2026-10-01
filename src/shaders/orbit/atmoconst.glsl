// Atmosphere constants shared by the LUT generators and the renderers (km^-1, km).
const float RG = 6371.0;
const float RT = 6471.0;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3);   // Rayleigh scattering
const float BM = 3.996e-3;                             // Mie scattering (boundary layer)
const float BMA = 0.444e-3;                            // Mie absorption
const vec3 BO = vec3(0.650e-3, 1.881e-3, 0.085e-3);   // ozone absorption
const float STRAT = 0.045;                             // stratospheric aerosol (relative to the boundary layer)

// densities: rayleigh, mie (boundary layer + thin stratospheric background), ozone
vec3 atmoDensity(float h) {
  float mie = exp(-h / 1.2) + STRAT * exp(-max(h - 12.0, 0.0) / 7.0) * smoothstep(0.0, 12.0, h);
  return vec3(exp(-h / 8.0), mie, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 atmoExtinction(vec3 dens) { return BR * dens.x + vec3(BM + BMA) * dens.y + BO * dens.z; }
