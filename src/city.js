import * as THREE from 'three';
import { STREET, centerX, mulberry32, fogUniforms, GLSL_FOG } from './config.js';

/* ------------------------------------------------------------------ */
/* Building shader: procedural lit windows + neon uplight from street */
/* ------------------------------------------------------------------ */

const buildingVert = /* glsl */ `
attribute float aSeed;
attribute vec3 aDims;
varying vec3 vLocalM;   // local position in meters
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSeed;
varying vec3 vDims;
varying float vViewDepth;

void main() {
  vSeed = aSeed;
  vDims = aDims;
  vLocalM = position * aDims; // unit box -> meters
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vViewDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const buildingFrag = /* glsl */ `
precision highp float;
varying vec3 vLocalM;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vSeed;
varying vec3 vDims;
varying float vViewDepth;
uniform float uTime;
${GLSL_FOG}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 n = normalize(vNormal);
  // pick the facade plane coordinates
  vec2 fc; // facade coords in meters
  float faceId;
  if (abs(n.y) > 0.5) { fc = vLocalM.xz; faceId = 0.0; }
  else if (abs(n.x) > 0.5) { fc = vec2(vLocalM.z, vLocalM.y); faceId = 1.0 + sign(n.x); }
  else { fc = vec2(vLocalM.x, vLocalM.y); faceId = 4.0 + sign(n.z); }

  // base facade: near-black concrete; staining patches + fine grain
  float patches = hash12(floor(fc * 0.3) + vSeed * 91.7);
  float fine = hash12(floor(fc * 4.0) + vSeed * 17.3);
  float fnoise = patches * 0.65 + fine * 0.35;
  float bSeed = hash12(vec2(vSeed * 71.3, 5.1));
  vec3 tint = mix(vec3(0.8, 1.0, 1.3), vec3(1.2, 1.0, 0.85), bSeed); // cool..warm
  vec3 base = vec3(0.008, 0.011, 0.016) * tint * (0.4 + 0.9 * fnoise) * (0.5 + bSeed);

  vec3 col = base;

  if (abs(n.y) < 0.5) {
    // ---- windows ----
    // per-building window style
    float style = hash12(vec2(vSeed * 31.7, 2.3));
    vec2 cell = mix(vec2(1.05, 1.45), vec2(1.6, 2.3), style); // pitch in meters
    vec2 id = floor(fc / cell);
    vec2 f = fract(fc / cell);
    float h = hash12(id + vSeed * 137.1 + faceId * 17.0);
    float litRand = hash12(id * 1.7 + vSeed * 53.3 + faceId * 7.0);

    // window aperture (small panes set in dark facade)
    vec2 ap0 = mix(vec2(0.3, 0.35), vec2(0.22, 0.3), style);
    vec2 ap1 = mix(vec2(0.7, 0.72), vec2(0.78, 0.74), style);
    float win = step(ap0.x, f.x) * step(f.x, ap1.x) * step(ap0.y, f.y) * step(f.y, ap1.y);

    // sparse lighting: 8–25% lit depending on building, clustered by floor
    float litThresh = 0.78 + 0.15 * hash12(vec2(vSeed, faceId));
    float floorHash = hash12(vec2(id.y, vSeed * 11.0 + faceId));
    float floorAwake = step(0.35, floorHash); // some floors fully dark
    float lit = step(litThresh, litRand) * floorAwake;

    // occasional flicker
    float flick = 1.0;
    if (litRand > 0.985) {
      flick = step(0.5, fract(uTime * (2.0 + h * 7.0) + h * 13.0)) * 0.8 + 0.2;
    }

    // window color: mostly warm/cool whites, few teal & pink
    vec3 wcol = mix(vec3(1.0, 0.72, 0.42), vec3(0.62, 0.8, 1.0), step(0.55, h));
    if (h > 0.94) wcol = vec3(0.2, 0.9, 1.0);
    else if (h < 0.04) wcol = vec3(1.0, 0.3, 0.55);

    float bright = (0.4 + 0.9 * h * h) * lit * flick;

    // street level is storefronts/shutters, not windows
    float storefront = smoothstep(4.5, 8.5, vWorldPos.y);

    // unlit glass is darker than the wall — punches depth into facades
    col = mix(col, base * 0.25, win * (1.0 - lit) * storefront);

    // LOD: distant facades collapse to a smooth averaged glow (kills moiré)
    float lodSharp = smoothstep(220.0, 70.0, vViewDepth);
    vec3 winLight = win * wcol * bright * storefront;
    vec3 avgGlow = wcol * 0.030 * storefront; // expected value of sparse lit windows
    col += mix(avgGlow, winLight, lodSharp);

    // ---- storefront band: shutters + the occasional lit shop ----
    float sf = 1.0 - storefront;
    if (sf > 0.0 && vWorldPos.y > 0.2) {
      // roller-shutter ribs, only on some shop units
      float rib = 0.5 + 0.5 * sin(vLocalM.y * 18.0);
      float ribbed = step(0.45, hash12(vec2(floor(fc.x / 5.0), vSeed * 41.0)));
      col += sf * vec3(0.002, 0.003, 0.004) * rib * ribbed;
      // segment the wall every ~5m into shop units
      float unit = floor(fc.x / 5.0);
      float uh = hash12(vec2(unit, vSeed * 23.0 + faceId));
      if (uh > 0.72) {
        // lit shopfront: warm or neon glow strip, brightest 1–3m up
        float winY = smoothstep(0.8, 1.6, vLocalM.y) * smoothstep(3.6, 2.8, vLocalM.y);
        vec3 shopCol = uh > 0.93 ? vec3(0.2, 0.9, 1.0) : (uh > 0.86 ? vec3(1.0, 0.3, 0.5) : vec3(1.0, 0.6, 0.25));
        float inUnit = smoothstep(0.06, 0.18, fract(fc.x / 5.0)) * smoothstep(0.94, 0.82, fract(fc.x / 5.0));
        col += sf * winY * inUnit * shopCol * 0.8;
      }
    }

  }

  // ---- street-level neon uplight ----
  // facades glow from below, color shifts in zones down the street
  float upY = clamp(1.0 - vWorldPos.y / 11.0, 0.0, 1.0);
  upY *= upY;
  float zone = hash12(vec2(floor(vWorldPos.z / 28.0), 3.7));
  float sideMix = smoothstep(-7.0, 7.0, vWorldPos.x - streetCenterXApprox(vWorldPos.z));
  vec3 colA = zone < 0.3 ? vec3(1.0, 0.16, 0.4) : (zone < 0.55 ? vec3(1.0, 0.45, 0.12) : (zone < 0.8 ? vec3(0.65, 0.25, 1.0) : vec3(0.1, 0.8, 1.0)));
  vec3 colB = zone < 0.3 ? vec3(0.1, 0.8, 1.0) : (zone < 0.55 ? vec3(0.2, 0.9, 0.8) : (zone < 0.8 ? vec3(1.0, 0.3, 0.4) : vec3(1.0, 0.6, 0.2)));
  vec3 streetGlow = mix(colA, colB, sideMix);
  // only faces that can see the street
  float facing = clamp(dot(n, normalize(vec3(streetCenterXApprox(vWorldPos.z) - vWorldPos.x, 0.35, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
  // patchy wash — light pools, not a uniform gradient
  float pool = 0.35 + 0.85 * vnoise(vWorldPos.zy * vec2(0.35, 0.22) + vSeed * 19.0);
  col += streetGlow * upY * facing * 0.075 * pool;

  // high-altitude ambient haze glow (city lights bouncing off clouds)
  float skyY = clamp(vWorldPos.y / 160.0, 0.0, 1.0);
  col += vec3(0.03, 0.05, 0.075) * skyY * 0.2;

  col = applyFog(col, vViewDepth);
  gl_FragColor = vec4(col, 1.0);
}
`;

// helper injected above main: approximate centerline (must match config)
const buildingFragFull = buildingFrag.replace(
  'uniform float uTime;',
  `uniform float uTime;
float streetCenterXApprox(float z) { return sin(z * 0.022) * 7.0; }`
);

export function createCity(scene) {
  const rng = mulberry32(1337);
  const plots = [];

  // --- street-flanking buildings, two depth rows each side ---
  for (let side = -1; side <= 1; side += 2) {
    for (let row = 0; row < 2; row++) {
      let z = STREET.zStart + 10;
      while (z > STREET.zEnd - 60) {
        const w = 8 + rng() * 14;
        const d = 10 + rng() * 16;
        const gap = rng() < 0.12 ? 6 + rng() * 8 : 0.5 + rng() * 2.5;
        const h = row === 0
          ? 18 + rng() * 55 + (rng() < 0.18 ? 50 : 0)
          : 45 + rng() * 90;
        const zc = z - w / 2;
        // stagger facades so the canyon isn't a flat wall
        const setback = row === 0 ? rng() * 2.2 : rng() * 6;
        const xEdge = centerX(zc) + side * (STREET.halfWidth + setback + row * (14 + rng() * 8));
        const xc = xEdge + side * d / 2;
        plots.push({ x: xc, z: zc, w, d, h, seed: rng() });
        z -= w + gap;
      }
    }
  }

  // --- distant mega-towers (backdrop silhouettes) ---
  // keep a clear corridor down the avenue so the Oracle orb stays visible
  for (let i = 0; i < 30; i++) {
    const z = -120 - rng() * 260;
    const x = centerX(z) + (rng() - 0.5) * 320;
    if (Math.abs(x - centerX(z)) < 44) continue;
    const w = 22 + rng() * 40;
    plots.push({ x, z, w, d: w * (0.7 + rng() * 0.6), h: 90 + rng() * 190, seed: rng() });
  }

  // mega tower at the end of the avenue, slightly off-axis
  plots.push({ x: centerX(-300) + 40, z: -310, w: 70, d: 70, h: 330, seed: 0.42 });
  plots.push({ x: centerX(-300) - 70, z: -290, w: 48, d: 48, h: 240, seed: 0.77 });

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: buildingVert,
    fragmentShader: buildingFragFull,
    uniforms: { uTime: { value: 0 }, ...fogUniforms() },
  });

  const mesh = new THREE.InstancedMesh(geo, mat, plots.length);
  const seeds = new Float32Array(plots.length);
  const dims = new Float32Array(plots.length * 3);
  const m = new THREE.Matrix4();
  plots.forEach((p, i) => {
    // p.w is the building's footprint ALONG the street (z), p.d is across (x)
    m.makeScale(p.d, p.h, p.w);
    m.setPosition(p.x, p.h / 2 - 0.5, p.z);
    mesh.setMatrixAt(i, m);
    seeds[i] = p.seed;
    dims[i * 3] = p.d; dims[i * 3 + 1] = p.h; dims[i * 3 + 2] = p.w;
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aDims', new THREE.InstancedBufferAttribute(dims, 3));
  mesh.frustumCulled = false;
  scene.add(mesh);

  addNeonTrims(scene, plots, rng);
  addBeacons(scene, plots);
  addGreebles(scene, plots, rng);

  return { update(t) { mat.uniforms.uTime.value = t; }, plots };
}

/* ----------------------- neon edge trims ----------------------- */

function addNeonTrims(scene, plots, rng) {
  const colors = ['#ff2d78', '#19e3ff', '#b44bff', '#ff9a1f', '#7dffb2'];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // only buildings reasonably near the street get neon architecture
  const candidates = plots.filter(p => Math.abs(p.x - centerX(p.z)) < 17 && p.h < 140);
  const MAX = 120;
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const trims = new THREE.InstancedMesh(geo, mat, MAX);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let idx = 0;
  for (const p of candidates) {
    if (idx >= MAX) break;
    if (rng() < 0.5) continue;
    const col = colors[Math.floor(rng() * colors.length)];
    const sideSign = Math.sign(p.x - centerX(p.z)) || 1;
    const wallX = p.x - sideSign * p.d / 2;     // street-facing wall
    const ch = p.h * (0.35 + rng() * 0.45);
    // vertical strip on one or both corners of the street wall
    const corners = rng() < 0.4 ? [-1, 1] : [rng() < 0.5 ? -1 : 1];
    for (const k of corners) {
      if (idx >= MAX) break;
      m.makeScale(0.15, ch, 0.15);
      m.setPosition(wallX - sideSign * 0.05, ch / 2, p.z + k * (p.w / 2 - 0.1));
      trims.setMatrixAt(idx, m);
      c.set(col).multiplyScalar(1.4 + rng() * 1.2);
      trims.setColorAt(idx, c);
      idx++;
    }
    // occasional horizontal trim band
    if (rng() < 0.35 && idx < MAX) {
      const bandY = 3 + rng() * Math.min(p.h - 5, 30);
      m.makeScale(0.12, 0.12, p.w * 0.9);
      m.setPosition(wallX - sideSign * 0.05, bandY, p.z);
      trims.setMatrixAt(idx, m);
      c.set(colors[Math.floor(rng() * colors.length)]).multiplyScalar(1.4 + rng());
      trims.setColorAt(idx, c);
      idx++;
    }
  }
  for (let i = idx; i < MAX; i++) {
    m.makeScale(0.0001, 0.0001, 0.0001); m.setPosition(0, -50, 0);
    trims.setMatrixAt(i, m);
  }
  trims.frustumCulled = false;
  scene.add(trims);
}

/* ----------------------- rooftop beacons ----------------------- */

function addBeacons(scene, plots) {
  const tall = plots.filter(p => p.h > 70);
  const positions = new Float32Array(tall.length * 3);
  const phases = new Float32Array(tall.length);
  tall.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.h + 1.5;
    positions[i * 3 + 2] = p.z;
    phases[i] = (p.seed * 10) % 1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      varying float vBlink;
      uniform float uTime;
      void main() {
        vBlink = smoothstep(0.7, 1.0, sin((uTime * 0.7 + aPhase * 6.283) * 2.0) * 0.5 + 0.5);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 260.0 / max(-mv.z, 1.0) * (0.5 + vBlink);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vBlink;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.0);
        gl_FragColor = vec4(vec3(1.0, 0.12, 0.1) * 3.0, a * (0.25 + vBlink));
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return mat;
}

/* ------------- facade greebles: AC units, balconies ------------- */

function addGreebles(scene, plots, rng) {
  // only the first row, low heights: AC units & junction boxes near eye level
  const near = plots.filter(p => Math.abs(p.x - centerX(p.z)) < 18 && p.z > -245);
  const COUNT = 500;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const m = new THREE.Matrix4();
  for (let i = 0; i < COUNT; i++) {
    const p = near[Math.floor(rng() * near.length)];
    const sideSign = Math.sign(p.x - centerX(p.z)) || 1;
    const wx = p.x - sideSign * (p.d / 2 + 0.25);
    const wy = 2.5 + rng() * Math.min(p.h - 4, 16);
    const wz = p.z + (rng() - 0.5) * p.w * 0.85;
    const s = 0.45 + rng() * 0.8;
    m.makeScale(0.6 * s, 0.5 * s, 0.9 * s);
    m.setPosition(wx, wy, wz);
    mesh.setMatrixAt(i, m);
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/* ------------------- cables strung across street ------------------ */

export function createCables(scene) {
  const rng = mulberry32(777);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x01030a });
  for (let z = STREET.zStart - 8; z > STREET.zEnd; z -= 12 + rng() * 14) {
    const cx = centerX(z);
    const nWires = 1 + Math.floor(rng() * 3);
    for (let w = 0; w < nWires; w++) {
      const h1 = 7 + rng() * 9;
      const h2 = h1 + (rng() - 0.5) * 4;
      const sag = 1.2 + rng() * 1.8;
      const zo = z + (rng() - 0.5) * 3;
      const p0 = new THREE.Vector3(cx - STREET.halfWidth - 1, h1, zo);
      const p2 = new THREE.Vector3(cx + STREET.halfWidth + 1, h2, zo + (rng() - 0.5) * 6);
      const mid = p0.clone().lerp(p2, 0.5); mid.y = Math.min(h1, h2) - sag;
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
      const tube = new THREE.TubeGeometry(curve, 14, 0.025, 3, false);
      group.add(new THREE.Mesh(tube, mat));
      // occasionally a hanging lantern at the lowest point
      if (rng() < 0.3) {
        const lcol = ['#ff2d78', '#ff9a1f', '#19e3ff'][Math.floor(rng() * 3)];
        const lant = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(lcol).multiplyScalar(2.2), toneMapped: false })
        );
        lant.position.copy(mid).add(new THREE.Vector3(0, -0.3, 0));
        group.add(lant);
      }
    }
  }
  scene.add(group);
}
