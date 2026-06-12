# VELA — District 7 // ヴェラ第七区

A first-person walk through a rain-soaked, neon-drenched cyberpunk megacity,
rendered in real time in the browser. Scroll to walk the avenue; move the
mouse to look around. If you stop scrolling, the city keeps walking for you.

![FPS](https://img.shields.io/badge/fps-~100-19e3ff) ![stack](https://img.shields.io/badge/three.js-r184-ff2d78)

## What's in the frame

- **Procedural city** — ~200 instanced towers with a custom facade shader:
  per-building window pitch, sparse clustered lit windows, flickering tubes,
  storefront shutters, neon edge trims, rooftop beacons, AC-unit greebles.
- **Wet street** — true planar reflections (mirrored scene render target)
  distorted by scrolling rain-ripple noise, expanding raindrop rings inside
  puddle masks, distance blur via render-target mipmaps.
- **Holographic mega-billboards** — glitch bands, chromatic splitting,
  scanlines, rolling refresh, all reflected in the asphalt.
- **The Oracle** — a ghostly holographic orb hanging over the end of the avenue.
- **Atmosphere** — GPU rain (2,600 instanced streaks), steam vents, drifting
  fog sheets, layered distance-haze glows, dust motes, a cloud deck lit from
  below by the city.
- **Life** — rim-lit pedestrian silhouettes with umbrellas, air-traffic light
  trails and dashed traffic streams overhead, catenary cables with lanterns,
  glowing vending machines.
- **Post** — HDR pipeline with mipmap bloom, ACES tone mapping, chromatic
  aberration, film grain, vignette, SMAA, and a final color grade.
- **Sound** — procedural WebAudio rain + city rumble (toggle, bottom-left).

Everything is generated in code — no textures, models, or assets are loaded.

## Run

```sh
npm install
npm run dev      # http://localhost:5179
npm run build    # production build in dist/
```

## Iterating on visuals

`npm run shot` drives the site headlessly (Edge + D3D11 ANGLE for real GPU
rendering) and screenshots several points along the walk into `shots/`:

```sh
node tools/shot.mjs 0.1 0.5 0.9   # custom walk positions (0..1)
```
