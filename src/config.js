// Every tunable value for the piece lives here.
export const CONFIG = {
  render: {
    maxDpr: 2,
    fov: 38,
    minHFov: 44,          // portrait screens widen the vertical fov to keep this much horizontally
    near: 0.5,
    far: 40000,
    exposure: 1.0,
  },

  camera: {
    position: [-20, 3.2, 118],
    padTarget: [21, 24, 0],   // aim right of the rocket: the vehicle sits in the left third, the words right of it
    portraitTargetX: 1,       // portrait: the vehicle centred
    portraitLift: 6,
    // how quickly the camera hands over from the pad framing to tracking the rocket
    trackStartAlt: 4,
    trackFullAlt: 40,
    trackLag: 1.6,
    leadAngle: 0.24,      // radians the vehicle sits above frame centre once tracking
    shake: {
      holdMax: 0.22,        // shake amplitude at full hold
      liftoff: 0.8,         // shake at the ignition flash
      decayAlt: 70,         // altitude over which liftoff shake halves
      rotScale: 0.012,      // radians per unit amplitude
      posScale: 0.35,       // world units per unit amplitude
      freq: 5.5,
    },
  },

  hold: {
    duration: 3.0,
    stage1End: 0.8,
    stage2End: 1.8,
    engineIgnite: [1.8, 2.05, 2.3, 2.55],
    igniteRamp: 0.35,
    abortDuration: 3.2,
  },

  liftoff: {
    clampHold: 0.7,        // seconds after release before the rocket moves
    accelA: 3.0,           // altitude = A*u^2 + B*u^3
    accelB: 2.0,
    driftX: -0.045,        // gentle downrange lean
    stageSepTime: 5.2,     // seconds after clamps release    // seconds after clamps release
    upperRelight: 0.7,
    fadeStart: 7.0,        // seconds after clamps release: the rocket is a point of light by now
    fadeDuration: 0.8,     // fade to black
    flashDecay: 0.32,
  },

  rocket: {
    radius: 2.2,
    bodyBottom: 3.2,
    bodyTop: 47,
    noseHeight: 9.5,
    bellSpread: 1.05,
    bellHeight: 2.4,
    bellTopR: 0.55,
    bellBottomR: 1.25,
    ventHeight: 31,
  },

  tower: {
    x: -9.5,
    z: -2,
    width: 5,
    height: 58,
    braceEvery: 5.5,
    arms: [13, 39],
    masts: [[52, 0, -40], [-58, 0, 22], [78, 0, 38]],
    mastHeight: 74,
  },

  colors: {
    silhouette: 0x0d0d0f,
    hull: 0x9c948a,
    ground: 0x0a0908,
    skyHorizon: [0.017, 0.015, 0.014],
    skyZenith: [0.0035, 0.004, 0.006],
    skyGlow: [1.0, 0.5, 0.2],
    engineLight: 0xff9a3c,
    trenchLight: 0xff7a2a,
    rim: 0xffd9b0,
    warning: [1.0, 0.16, 0.05],
    plumeCore: [1.0, 0.8, 0.55],
    plumeBody: [1.0, 0.42, 0.10],
    plumeEdge: [0.9, 0.22, 0.04],
    // smoke is mostly condensed deluge water: bright albedo, dark only because the night is dark
    smokeAlbedo: [0.78, 0.76, 0.74],
    smokeAmbient: [0.010, 0.012, 0.018],   // night sky from above
    padFlood: [0.30, 0.21, 0.12],           // sodium floodlights around the pad
    fireLight: [1.35, 0.60, 0.19],        // colour x scale of the engine light falling on smoke
    smokeBacklit: [1.0, 0.55, 0.22],
    vapor: [0.8, 0.8, 0.82],
    cloud: [0.30, 0.30, 0.31],
    flash: [1.0, 0.72, 0.45],
  },

  light: {
    engineFull: 15000,      // point light candela at full power
    trenchFull: 2600,
    trenchSmoke: 1.3,       // trench-exit fire lighting the deluge cloud
    flashBoost: 3.0,
    holdThrust: 0.45,       // light output while held on the pad, relative to liftoff
    padResidualDecay: 17,   // seconds, glow left in the ground cloud
    bellGlowMax: 0.9,
    rim: 0.32,
    hemi: 0.10,
    skyGlow: 1.0,
  },

  plume: {
    intensity: 5.0,        // HDR scale of the exhaust (the exposure pulls it back down)
    engineLenPad: 17,
    engineWidthPad: 1.45,
    mainLen: 58,
    mainWidth: 3.6,
    jellyStartAlt: 500,
    jellyFullAlt: 2600,
    jellyExpand: 38.0,
    splashLen: 30,
    splashWidth: 5.5,
  },

  // wet concrete around the pad: planar reflection of the scene and the smoke
  wet: {
    height: -2.95,
    size: 1400,
    center: [0, 200],
    strength: 1.0,
    resolution: 0.5,      // of the drawing buffer
  },

  smoke: {
    max: 3000,
    atlasSize: 1024,       // 4x4 procedural variants
    // extinction grid over the pad for smoke-on-smoke shadowing
    grid: { min: [-220, -6, -110], max: [220, 160, 110], cell: 6, steps: 8, maxMarch: 140 },
    extinction: 1.0,
    multiScatter: 0.35,    // share of light that leaks through deep smoke (multiple scattering)
    exitPos: [26, 1.5, 0], // where the deflected flame leaves the trench (mirrored for the other side)
    maxLit: 14,
    cloudCount: 40,
    eruptionRate: 210,     // particles per second at full eruption
    holdRate: 26,
    trailRate: 110,
    lightRadius: 27,
    cloudLightRadius: 240,
    shadeStrength: 1.0,
    temporalBlend: 0.5,    // weight of the current frame in the smoke history blend
  },

  sparks: {
    max: 1800,
    rate: 1300,
    gravity: 22,
  },

  bloom: {
    intensity: 1.15,
    flashIntensity: 2.6,
    orbitIntensity: 0.35,
    orbitRadius: 0.85,
    orbitThreshold: 2.5,       // in orbit only the sun, the glint and hot metal bloom
    threshold: 0.85,
    smoothing: 0.25,
    radius: 0.72,
  },

  // measured eye adaptation (log-average luminance, centre weighted)
  autoExposure: {
    // per-scene metering profiles. base: exposure at the reference; ref: metered log2 luminance of the
    // unlit scene; strength: stops of exposure pulled per metered stop above ref; maxDrop: limit in stops
    launch: { base: 1.55, ref: -6.9, strength: 0.62, maxDrop: 4.5, highlight: 0.7, ceiling: 400 },
    orbit: { base: 40, ref: -14.5, strength: 0.63, maxDrop: 9, highlight: 0.3, ceiling: 40 },
    adaptUp: 1.5,         // per second toward a brighter scene (~1.5s to mostly settle)
    adaptDown: 0.75,      // per second back toward the dark
    centerWeight: 0.6,
    highlight: 0.7,       // 0 = pure log average, 1 = pure linear mean
  },

  post: {
    flare: 0.0012,              // lens ghosts from the sun (relative to its HDR brightness after exposure)
    aberration: 0.00012,
    aberrationEdgeStart: 0.62,  // radial fraction where fringing begins
    anamorphic: 0.0,     // launch: no streak (the sun gets its own restrained flare)
    anamorphicThreshold: 5.0,   // only the sun and the engine core streak, never a lit hull
    motionBlur: 1.0,
    grain: 0.16,
    vignetteOffset: 0.28,
    vignetteDarkness: 0.62,
  },

  // the orbit timeline (seconds / degrees)
  orbit: {
    lengths: [1, 5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120],   // the stepper's focus lengths (minutes)
    defaultMinutes: 1,
    fadeIn: 1.5,                // fade in on the window
    nightOpen: 7,               // seconds of night before the sun breaks the limb (the session starts then)
    preRiseDepth: 16,            // degrees below the limb at the cut: the dawn glow builds over the night open
    preRiseRate: 0.4,           // deg/s the sun sinks after sunset
    riseRate: 0.12,             // deg/s at the moment of sunrise: the disc clears the limb in ~4-5 s
    arcMin: 30,                 // peak height of the sun above the limb for a 1 minute session
    arcMax: 70,                 // ... and for sessions of 15 minutes or more
    setDepth: 0.35,             // below-limb height at which the last light is gone (at the timer's zero)
    riseAzimuth: -11,           // the sun rises left of the window's axis...
    setAzimuth: 13,             // ...and sets right of it
    sunDesaturate: 0.3,
    groundSpeed: 7.66,          // km/s along the ground track
    cloudDrift: 0.00000045,     // texture u per second
    settleAfterSunset: 6,       // seconds after sunset before the words return
    earlySet: 9,                // an early end: seconds for the sun to go down to the limb
  },

  earth: {
    radius: 6371,               // km
    altitude: 420,
    near: 5,
    far: 60000,
    startLat: 31.5,             // straight below the window at the cut: over the eastern Mediterranean
    startLon: 22.0,
    heading: 62,                // window heading, degrees clockwise from north (toward the Levant / Nile)
    sunRadius: 0.2666,          // angular radius, degrees
    sunRadiance: 1500,          // HDR radiance of the disc (a white surface at noon reads 1.0)
    bumpStrength: 0.22,         // global fallback relief (before elevation tiles arrive)
    reliefExaggeration: 1.6,    // terrain normals and shadows from the elevation tiles
    cityGain: 0.05,
    cityColor: [1.0, 0.74, 0.40],     // high-pressure sodium, as the ISS photos show it
    nightGlow: 0.0018,          // airglow + starlight on the night side (relative to noon)
    glintRoughness: 0.06,       // mean sea-surface slope; varied by wind fields and calm slicks
    seaColor: [0.006, 0.013, 0.028],  // linear albedo of the open ocean (deep navy)
    stars: 3200,
    cloudNoiseSize: 64,
    cloudCubeSize: 1024,         // baked coverage / cloud-top bound, per cube face
    cloudBase: 1.4,             // km
    cloudMax: 9.0,              // km: the tallest towers
    cloudBaseline: 0.42,
    flashEvery: [1.2, 4.5],     // seconds between lightning flashes on the night side
    flashGain: 0.07,
    flashMinCoverage: 0.45,
    stormRadius: 170,           // km: thunderstorm clusters placed on the night passes     // lightning only where the coverage map has real cloud
    starBrightness: 0.006,      // stars are faint: only the night exposure finds them
  },

  // streamed imagery (NASA GIBS, Web Mercator XYZ)
  tiles: {
    texelPx: 1.0,               // split a tile while one of its texels would cover more than this many pixels
    maxZ: 12,
    landMaxZ: 12,               // Landsat WELD
    weldDate: '2000-12-01',
    heightMaxZ: 12,             // AWS Terrain Tiles (terrarium)
    cacheBudget: 220,           // textures kept per layer (~75 MB of GPU memory each at 256px with mips)
    inflight: 16,               // concurrent requests per layer (GIBS speaks HTTP/2)
  },

  // the cabin wall around the porthole (metres)
  cabin: {
    fov: 55,
    minHFov: 56,                // the whole porthole stays in view on portrait screens
    holeRadius: 0.2,
    wallDepth: 0.17,            // the thick hull: the tunnel from the inner wall to the outer pane
    innerPane: 0.05,
    outerPane: 0.15,
    flangeOuter: 0.25,
    padOuter: 0.37,
    padThickness: 0.03,
    bolts: 16,
    ledgeY: -0.34,
    ledPos: [0.3, 0.27, 0.02],
    timerOnGlass: [0, 0, -0.05],        // the countdown sits at the centre of the inner pane (window-local metres)
    pitch: -24,                 // window axis below the local horizontal (the limb sits in the upper part)
    roll: 5,
    eye: [0.03, -0.01, 0.56],   // the viewer's eye, window-local
    look: [0.0, 0.0, -0.2],
    sway: { pos: 0.012, rot: 0.35 },
    shadowSize: 2048,
    nightFill: 0.014,           // dim cabin night lighting: the frame always reads as a solid surround
    earthshine: 0.55,
    nightEarthshine: 0.0004,
    earthshineColor: [0.62, 0.72, 0.9],
    bounce: 0.35,
    tileCone: 34,               // half-angle (deg) of the view the porthole allows, with room for sway
    ledLight: 0.00025,
    ledGlow: 0.06,              // emissive level of the indicator (HDR, before exposure)
  },

  audio: {
    master: 0.8,
    // the launch: low, warm and soft (it plays at every launch, so it must never grate)
    rumble: 0.32,     // sub rumble under the hold and liftoff
    roar: 0.2,        // the engines' roar
    roarMaxCutoff: 450,   // Hz: keeps the roar deep, never hissy
    crackle: 0,       // the bright crackle bursts (0 = off: they read as buzz)
    thump: 0.45,      // the ignition thump
    hum: 0.05,        // cabin air and drone
    tone: 0.6,        // the soft tone at the end
    music: 0.9,       // the organ at sunrise and sunset (the chords are already quiet)
    hall: 7.0,        // seconds of reverb tail
    padEvery: [180, 300],   // seconds between the faint pads in long sessions
  },

  quality: {
    checkFrames: 90,
    slowMs: 21,
    minSmokeScale: 0.35,
    minDpr: 1,
  },
};

// Phones and tablets: a lighter mode (lower resolution, less smoke, smaller caches and shadows).
export const IS_MOBILE = (() => {
  try { return window.matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); } catch (e) { return false; }
})();
if (IS_MOBILE) {
  const C = CONFIG;
  C.render.maxDpr = 1.25;
  C.smoke.max = 1400;
  C.smoke.eruptionRate *= 0.6;
  C.smoke.trailRate *= 0.6;
  C.smoke.atlasSize = 512;
  C.wet.resolution = 0.3;
  C.tiles.cacheBudget = 90;
  C.tiles.inflight = 8;
  C.tiles.texelPx = 1.4;
  C.cabin.shadowSize = 1024;
  C.earth.cloudBaseline *= 0.8;
  C.quality.slowMs = 24;
}
