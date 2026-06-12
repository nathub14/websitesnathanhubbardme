import * as THREE from 'three';
import { STREET, centerX, mulberry32, fogUniforms, GLSL_FOG, PALETTE } from './config.js';
import { bladeSignTexture, wallSignTexture, holoAdTexture, glowTexture, vendingTexture } from './textures.js';

/* ------------------------------------------------------------------ */
/*  Emissive sign material (textured, flickering, fogged)              */
/* ------------------------------------------------------------------ */

function signMaterial(texture, { intensity = 2.2, flicker = 0 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    uniforms: {
      tMap: { value: texture },
      uIntensity: { value: intensity },
      uFlicker: { value: flicker },
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vViewDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform float uIntensity, uFlicker, uTime, uSeed;
      varying vec2 vUv;
      varying float vViewDepth;
      ${GLSL_FOG}
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec4 tex = texture2D(tMap, vUv);
        float fl = 1.0;
        if (uFlicker > 0.0) {
          float t = uTime * 9.0 + uSeed;
          fl = mix(1.0, step(0.18, hash(floor(t))) * (0.75 + 0.25 * hash(floor(t * 3.0))), uFlicker);
        }
        vec3 col = tex.rgb * uIntensity * fl;
        col = applyFog(col, vViewDepth);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

const signMats = [];

/* ------------------------------------------------------------------ */
/*  Blade signs marching down the street                               */
/* ------------------------------------------------------------------ */

const BLADE_DEFS = [
  { chars: '麺屋', latin: 'NOODLE', color: '#ff9a1f' },
  { chars: '電脳', latin: 'CYBER', color: '#19e3ff' },
  { chars: '酒場', latin: 'BAR', color: '#ff2d78' },
  { chars: 'ホテル', latin: 'HOTEL', color: '#b44bff' },
  { chars: '質屋', latin: 'PAWN', color: '#7dffb2' },
  { chars: '薬局', latin: 'PHARMA', color: '#ff3b30' },
  { chars: '占い', latin: 'ORACLE', color: '#19e3ff' },
  { chars: '美容', latin: 'CLINIC', color: '#ff2d78' },
  { chars: '遊技', latin: 'ARCADE', color: '#ff9a1f' },
  { chars: 'カラオケ', latin: 'KARAOKE', color: '#b44bff' },
  { chars: '寿司', latin: 'SUSHI', color: '#7dffb2' },
  { chars: '銭湯', latin: 'BATHS', color: '#ff9a1f' },
];

export function createBladeSigns(scene, plots) {
  const rng = mulberry32(4242);
  const group = new THREE.Group();
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x05070c });

  const textures = BLADE_DEFS.map(d => bladeSignTexture(d.chars, d.color, { latin: d.latin }));

  // anchor every sign to a real first-row building wall
  const walls = plots.filter(p => Math.abs(p.x - centerX(p.z)) < 17 && p.z < STREET.zStart && p.z > STREET.zEnd);
  for (const p of walls) {
    const sideSign = Math.sign(p.x - centerX(p.z)) || 1;
    const wallX = p.x - sideSign * p.d / 2;
    const nSigns = Math.min(3, Math.max(1, Math.floor(p.w / 7))) + (rng() < 0.4 ? 1 : 0);
    for (let s = 0; s < nSigns; s++) {
      if (rng() < 0.25) continue;
      const def = Math.floor(rng() * textures.length);
      const { texture, aspect } = textures[def];
      const h = 2.0 + rng() * 3.4;
      const w = h * aspect;
      const maxY = Math.min(p.h - 2, 14);
      const y = 3.5 + rng() * Math.max(maxY - 3.5, 1);
      const z = p.z + (rng() - 0.5) * (p.w - 2);

      const mat = signMaterial(texture, {
        intensity: 2.0 + rng() * 1.4,
        flicker: rng() < 0.22 ? 0.85 : 0,
      });
      signMats.push(mat);

      // blade sticks out perpendicular from the wall, readable down-street
      // (plane normal stays on z so walkers see its face)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      sign.position.set(wallX, y, z);
      sign.geometry.translate(sideSign > 0 ? -w / 2 : w / 2, 0, 0);
      group.add(sign);

      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), frameMat);
      bracket.position.set(wallX - sideSign * w * 0.4, y + h / 2 - 0.2, z);
      group.add(bracket);
    }
  }

  scene.add(group);
}

/* ------------------------------------------------------------------ */
/*  Flat wall signs                                                     */
/* ------------------------------------------------------------------ */

const WALL_DEFS = [
  { text: '月光ティー', sub: 'GEKKO TEA HOUSE', color: '#7dffb2' },
  { text: 'ラーメン龍', sub: 'DRAGON RAMEN', color: '#ff9a1f' },
  { text: 'シンセ・バー', sub: 'SYNTH BAR 02', color: '#ff2d78' },
  { text: 'クロネコ', sub: 'KURONEKO CLUB', color: '#b44bff' },
  { text: '未来銀行', sub: 'MIRAI BANK', color: '#19e3ff' },
  { text: 'パチンコ宝', sub: 'TAKARA PACHINKO', color: '#ff3b30' },
  { text: 'DREAMS', sub: 'FOR SALE — FLOOR 9', color: '#19e3ff' },
  { text: '雨ホテル', sub: 'HOTEL AME ☂ VACANCY', color: '#ff2d78' },
];

export function createWallSigns(scene, plots) {
  const rng = mulberry32(9090);
  const group = new THREE.Group();
  const textures = WALL_DEFS.map(d => wallSignTexture(d.text, d.color, { sub: d.sub }));

  const walls = plots.filter(p => Math.abs(p.x - centerX(p.z)) < 17 && p.z < STREET.zStart && p.z > STREET.zEnd - 20);
  for (const p of walls) {
    if (rng() < 0.45) continue;
    const sideSign = Math.sign(p.x - centerX(p.z)) || 1;
    const wallX = p.x - sideSign * p.d / 2;
    const i = Math.floor(rng() * textures.length);
    const { texture, aspect } = textures[i];
    const h = Math.min(1.6 + rng() * 2.4, p.w / aspect * 0.8);
    const w = h * aspect;
    const y = 3.2 + rng() * Math.max(Math.min(p.h - h - 2, 16) - 3.2, 1);
    const z = p.z + (rng() - 0.5) * Math.max(p.w - w - 1, 0);
    const mat = signMaterial(texture, { intensity: 1.9 + rng() * 1.2, flicker: rng() < 0.18 ? 0.7 : 0 });
    signMats.push(mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    sign.position.set(wallX - sideSign * 0.06, y, z);
    sign.rotation.y = sideSign > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(sign);
  }
  scene.add(group);
}

/* ------------------------------------------------------------------ */
/*  Holographic mega-billboards                                        */
/* ------------------------------------------------------------------ */

const HOLO_DEFS = [
  { title: 'VELA', jp: 'ヴェラ・コープ', tagline: 'Own the night', accent: '#19e3ff' },
  { title: 'AOZORA', jp: '蒼空サイバネ', tagline: 'Better parts. Better you.', accent: '#ff2d78' },
  { title: 'KAGE', jp: '影レコード', tagline: 'Music for the flooded world', accent: '#b44bff' },
  { title: 'MIRAI', jp: '未来銀行', tagline: 'Your future, collateralized', accent: '#ff9a1f' },
  { title: 'SYNTH', jp: '人工夢', tagline: 'Dreams on tap', accent: '#7dffb2' },
];

function holoMaterial(texture, accent) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      tMap: { value: texture },
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 100 },
      uAccent: { value: new THREE.Color(accent) },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vViewDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform float uTime, uSeed;
      uniform vec3 uAccent;
      varying vec2 vUv;
      varying float vViewDepth;
      ${GLSL_FOG}
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 uv = vUv;

        // rolling glitch bands
        float band = floor(uv.y * 36.0 + uTime * 2.0);
        float g = hash(band + uSeed);
        float glitchAmt = step(0.96, hash(floor(uTime * 3.0) + band * 0.13 + uSeed));
        uv.x += (g - 0.5) * 0.06 * glitchAmt;

        // slow vertical roll
        float roll = smoothstep(0.0, 0.15, abs(fract(uv.y - uTime * 0.045) - 0.5) * 2.0 - 0.7);

        // chromatic split
        float ca = 0.004 + glitchAmt * 0.01;
        vec3 col;
        col.r = texture2D(tMap, uv + vec2(ca, 0.0)).r;
        col.g = texture2D(tMap, uv).g;
        col.b = texture2D(tMap, uv - vec2(ca, 0.0)).b;
        float a = max(max(col.r, col.g), col.b);

        // scanlines
        float scan = 0.75 + 0.25 * sin(uv.y * 420.0 + uTime * 8.0);
        // big slow flicker
        float flick = 0.88 + 0.12 * sin(uTime * 47.0 + uSeed) * sin(uTime * 13.7);

        // holo tint drift toward accent at edges
        float edge = smoothstep(0.5, 0.0, abs(uv.x - 0.5)) * smoothstep(0.5, 0.0, abs(uv.y - 0.5));
        col = mix(col * uAccent * 1.6, col, edge * 0.8 + 0.2);

        // soft edge fade
        float fade = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x)
                   * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);

        vec3 final = col * 3.4 * scan * flick * (0.65 + 0.55 * roll);
        float alpha = a * fade * 0.85;
        // additive: fog only attenuates holograms
        final = attenFog(final, vViewDepth * 0.6);
        gl_FragColor = vec4(final, alpha);
      }
    `,
  });
}

export function createHoloBillboards(scene) {
  const rng = mulberry32(5151);
  const group = new THREE.Group();
  const placements = [
    { z: -42, side: 1, y: 22, h: 28, ang: 0.35 },
    { z: -78, side: -1, y: 28, h: 32, ang: 0.3 },
    { z: -116, side: 1, y: 26, h: 36, ang: 0.4 },
    { z: -158, side: -1, y: 34, h: 42, ang: 0.3 },
    { z: -200, side: 1, y: 30, h: 34, ang: 0.35 },
  ];
  placements.forEach((p, i) => {
    const def = HOLO_DEFS[i % HOLO_DEFS.length];
    const tex = holoAdTexture({ ...def });
    const mat = holoMaterial(tex, def.accent);
    signMats.push(mat);
    const w = p.h * (512 / 768);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, p.h), mat);
    const cx = centerX(p.z);
    // mounted just off the canyon wall, facing DOWN the street at the walker
    mesh.position.set(cx + p.side * (STREET.halfWidth + 1.5 + w * 0.18), p.y, p.z);
    mesh.rotation.y = -p.side * p.ang; // mostly toward +z, slight angle inward
    mesh.userData.noReflect = false; // holograms DO reflect — looks amazing in puddles
    group.add(mesh);
  });
  scene.add(group);
}

/* ------------------------------------------------------------------ */
/*  THE ORACLE — giant holographic orb at the end of the avenue       */
/* ------------------------------------------------------------------ */

export function createOracleOrb(scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      ${GLSL_FOG}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 n = normalize(vNormal);
        float fres = pow(1.0 - abs(n.z), 1.6);

        // soft drifting bands, broken by noise so they never read as stripes
        float band = sin(vWorldPos.y * 0.55 - uTime * 0.6
                         + noise(vWorldPos.xy * 0.12 + uTime * 0.05) * 3.0) * 0.5 + 0.5;
        band = mix(0.55, 1.0, band);
        float grain = noise(vWorldPos.xy * 0.35 - uTime * 0.07) * 0.3 + 0.7;
        float fineScan = 0.92 + 0.08 * sin(vWorldPos.y * 18.0 + uTime * 3.0);

        float breathe = 0.85 + 0.15 * sin(uTime * 0.4);

        vec3 core = vec3(1.0, 0.4, 0.55);
        vec3 rim  = vec3(0.55, 0.85, 1.0);
        vec3 col = mix(core, rim, fres * 0.7) * band * grain * fineScan * breathe;

        // ethereal: faint core, glowing limb
        float alpha = (0.1 + 0.5 * fres) * band;
        col = attenFog(col * 2.8, vViewDepth * 0.3);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  signMats.push(mat);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(24, 48, 48), mat);
  orb.position.set(centerX(-300) + 1, 62, -300);
  scene.add(orb);

  // soft halo so the orb reads through the murk
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: new THREE.Color('#ff5d8a').multiplyScalar(0.55),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  halo.position.copy(orb.position);
  halo.position.z += 2;
  scene.add(halo);
  return orb;
}

/* ------------------------------------------------------------------ */
/*  Street lamps with fake volumetric cones + ground glow              */
/* ------------------------------------------------------------------ */

export function createLamps(scene) {
  const rng = mulberry32(2024);
  const group = new THREE.Group();
  const poleMat = new THREE.MeshBasicMaterial({ color: 0x04060b });
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfe9ff').multiplyScalar(3.0), toneMapped: false });
  const glowTex = glowTexture();

  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv; vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float v = vUv.y;                   // 1 at top (lamp head)
        float a = pow(v, 3.0) * 0.035;
        gl_FragColor = vec4(vec3(0.55, 0.8, 1.0), a);
      }
    `,
  });

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color('#7fc4e8'), opacity: 0.22,
  });

  for (let z = STREET.zStart - 10; z > STREET.zEnd; z -= 17) {
    const side = (Math.round(z / 17) % 2 === 0) ? 1 : -1;
    const cx = centerX(z);
    const x = cx + side * (STREET.halfWidth - 1.5);
    const H = 7.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, H, 6), poleMat);
    pole.position.set(x, H / 2, z);
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), poleMat);
    arm.position.set(x - side * 0.8, H, z);
    group.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.22), headMat);
    head.position.set(x - side * 1.5, H - 0.05, z);
    group.add(head);

    // fake light cone
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.7, H - 0.5, 12, 1, true), coneMat);
    cone.position.set(x - side * 1.5, (H - 0.5) / 2, z);
    cone.userData.noReflect = true;
    group.add(cone);

    // ground glow pool
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x - side * 1.5, 0.02, z);
    pool.userData.noReflect = true;
    group.add(pool);
  }
  scene.add(group);
}

/* ------------------------------------------------------------------ */
/*  Vending machines + street clutter                                  */
/* ------------------------------------------------------------------ */

export function createStreetProps(scene) {
  const rng = mulberry32(606);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x070a12 });
  const defs = [
    ['#19e3ff', 'DRINK', '飲料'],
    ['#ff2d78', 'SODA', 'ソーダ'],
    ['#ff9a1f', 'HOT', '温かい'],
    ['#7dffb2', 'SYNTH', '合成'],
  ];
  const texs = defs.map(d => vendingTexture(...d));

  for (let z = STREET.zStart - 18; z > STREET.zEnd + 10; z -= 22 + rng() * 26) {
    const side = rng() < 0.5 ? -1 : 1;
    const cx = centerX(z);
    const x = cx + side * (STREET.halfWidth - 0.8);
    const i = Math.floor(rng() * texs.length);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), bodyMat);
    body.position.set(x, 0.95, z);
    group.add(body);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.8),
      signMaterial(texs[i], { intensity: 1.6 })
    );
    face.position.set(x - side * 0.42, 0.95, z);
    face.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(face);
  }

  // dark clutter: crates, dumpsters, kiosk husks along the walls
  const clutterMat = new THREE.MeshBasicMaterial({ color: 0x05070d });
  for (let z = STREET.zStart - 8; z > STREET.zEnd + 6; z -= 9 + rng() * 14) {
    const side = rng() < 0.5 ? -1 : 1;
    const cx = centerX(z);
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const w = 0.5 + rng() * 1.3;
      const h = 0.4 + rng() * 1.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5 + rng() * 1.2), clutterMat);
      box.position.set(cx + side * (STREET.halfWidth - 0.6 - rng() * 0.9), h / 2, z + i * (rng() * 2 + 0.6));
      box.rotation.y = (rng() - 0.5) * 0.5;
      group.add(box);
    }
  }
  scene.add(group);
}

/* ------------------------------------------------------------------ */

export function updateSigns(t) {
  for (const m of signMats) {
    if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
  }
}
