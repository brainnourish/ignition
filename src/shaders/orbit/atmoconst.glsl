// Atmosphere constants shared by the LUT generators and the renderers (km^-1, km).
// ATMO_K stretches the atmosphere vertically while keeping its optical depth: every scale height
// grows by K and every coefficient shrinks by K. Looking down nothing changes; at the limb the
// layers (orange troposphere, white aerosol, blue sky) read K times thicker, like the telephoto
// ISS photographs. Set from CONFIG.earth.atmosphereScale (passed as a define).
#ifndef ATMO_K
#define ATMO_K 1.0
#endif
#ifndef OZONE_GAIN
#define OZONE_GAIN 1.0
#endif
const float RG = 6371.0;
const float RT = 6371.0 + 100.0 * ATMO_K;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3) / ATMO_K;   // Rayleigh scattering
const float BM = 3.996e-3 / ATMO_K;                             // Mie scattering (boundary layer)
const float BMA = 0.444e-3 / ATMO_K;                            // Mie absorption
const vec3 BO = vec3(0.650e-3, 1.881e-3, 0.085e-3) * OZONE_GAIN / ATMO_K;   // ozone absorption (its Chappuis band makes the twilight blue)
const float STRAT = 0.015;                             // stratospheric aerosol (relative to the boundary layer)

// densities: rayleigh, mie (boundary layer + thin stratospheric background), ozone
vec3 atmoDensity(float hKm) {
  float h = hKm / ATMO_K;
  float mie = exp(-h / 1.2) + STRAT * exp(-max(h - 12.0, 0.0) / 7.0) * smoothstep(0.0, 12.0, h);
  return vec3(exp(-h / 8.0), mie, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 atmoExtinction(vec3 dens) { return BR * dens.x + vec3(BM + BMA) * dens.y + BO * dens.z; }
