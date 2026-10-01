# ignition

A cinematic night rocket launch that becomes a focus timer. Hold to ignite; the rocket climbs to a point of light, and the view cuts to the inside of a spacecraft, looking out of a porthole at the Earth from about 420 km. The session starts the moment the sun breaks the horizon and ends at orbital sunset.

Hold the mouse, a touch, or the spacebar for about three seconds, and release at full power. Releasing early aborts. Set the session length before launching with the control under the title (− 25 +, "minutes of focus": click − / +, scroll over it, or use the arrow keys; 1 to 120 minutes, remembered). During the session the countdown sits on the porthole glass; move the pointer to reveal "end session" (or press Escape), which asks before ending. Leave the tab and come back: the cabin's indicator light blinks. The session ends with "your ascent is complete". Sound is on by default (it starts with your first click or key, as browsers require); the dot in the corner turns it off, and that choice is remembered.

## Run

```bash
npm install
npm run dev      # http://localhost:5190
npm run build    # static files in dist/
```

The window streams imagery from NASA GIBS and elevation from AWS Terrain Tiles over the network; offline, it falls back to the bundled global textures in `public/textures/`.

## Layout

- `src/config.js` — every tunable, plus the lighter mobile profile at the bottom.
- `src/main.js` — renderer, loop, resize (portrait-aware field of view), adaptive quality (smoke first on the pad, resolution first in orbit).
- `src/sequence.js` — the state machine: hold, abort, ignition, liftoff, the cut, the focus session, the ending.
- **Launch**: `scene.js` (pad, tower, rocket), `plume.js`, `smoke.js` (instanced smoke, self-shadowed through a density grid, lit per pixel by direction to the fire), `sparks.js`, `reflector.js` (planar reflection for the wet concrete), `camera.js`.
- **Post** (`post.js`, `exposure.js`): HDR half-float chain with measured eye adaptation (log/linear metering on the GPU, per-scene profiles), bloom, lens ghosts for the sun, heat shimmer, grain, ACES.
- **Orbit** (`src/orbit/`):
  - `orbit.js` — the timeline (night open, sunrise, the sun's arc, sunset at zero), sun colour through the air, the camera's sway, lightning, storms, tile prefetch.
  - `cabin.js` — the porthole: padded wall, flange and bolts, the dark tunnel, two panes with smudges and dust, a ledge, handrail, cables, the indicator light; the sun casts through the hole.
  - `earth.js` + `shaders/orbit/` — the planet, in km: single-scattering atmosphere with transmittance and multiple-scattering LUTs (aerial perspective per vertex, per pixel near the horizon), the sun disc, relief-marched layered clouds (real coverage + Perlin-Worley detail, self-shadowing, ground shadows), terrain normals and cast shadows, ocean glint with varying sea state, city lights, airglow.
  - `tiles.js` — the quadtree tile streamer (screen-space texel rule, porthole-cone culling, prefetch, retry, LRU eviction).

## Data and attribution

- Landsat WELD true colour (2000), Blue Marble Next Generation, VIIRS Black Marble (2016) and the MODIS water mask, via NASA GIBS: public domain. "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."
- Elevation: AWS Terrain Tiles (Mapzen terrarium), open data; sources include SRTM, GMTED2010, ETOPO1 and others.
- The bundled fallback textures are NASA Blue Marble / Black Marble derivatives.

## Tools

- `node tools/shots.mjs <outDir> <beat> [dpr]` — screenshots at exact simulated times (`tools/beats/*.mjs`: `launch`, `abort`, `orbit`, `compare`, `horizon`, `session`, `mobile`, `fullflow`, `texel`, `orbitperf`). `MOBILE=1` emulates a phone; `URL=` points at another server (e.g. `vite preview`).
- `node tools/beats/...` via `shots.mjs session` — the focus-timer checks (PASS/FAIL).
- `python3 tools/sheet.py`, `python3 tools/compare.py` — contact sheets and side-by-sides against reference photos.
- `node tools/perf.mjs` — frame times through the launch.
