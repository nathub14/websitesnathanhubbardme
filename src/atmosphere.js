import * as THREE from 'three';
import { STREET, centerX, mulberry32, FOG_COLOR } from './config.js';
import { smokeTexture, glowTexture } from './textures.js';

/* ------------------------------- sky ------------------------------- */

export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFog: { value: FOG_COLOR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // push to far plane
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uFog;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);

        // base gradient: fog color at horizon -> near-black zenith
        vec3 zen = vec3(0.004, 0.008, 0.016);
        vec3 hor = uFog * 1.35 + vec3(0.06, 0.0, 0.03);
        vec3 col = mix(hor, zen, pow(h, 0.55));

        // low cloud deck lit from below by the city
        vec2 cuv = d.xz / max(d.y, 0.06) * 0.35;
        float cl = fbm(cuv * 1.2 + vec2(uTime * 0.008, uTime * 0.004));
        float deck = smoothstep(0.4, 0.85, cl) * smoothstep(0.55, 0.1, h);
        col += vec3(0.09, 0.05, 0.08) * deck;
        col += vec3(0.02, 0.06, 0.08) * smoothstep(0.6, 0.95, cl) * smoothstep(0.45, 0.1, h) * 0.6;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 24), mat);
  sky.userData.noReflect = false;
  sky.frustumCulled = false;
  scene.add(sky);
  return { update(t) { mat.uniforms.uTime.value = t; } };
}

/* --------------------------- fog sheets ---------------------------- */
/* Big soft scrolling-noise planes across the street: fake volumetrics  */

export function createFogSheets(scene) {
  const rng = mulberry32(33);
  const mats = [];
  const mat = (tint, op) => {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(tint) },
        uOp: { value: op },
        uSeed: { value: rng() * 10 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime, uOp, uSeed;
        uniform vec3 uTint;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 p = vUv * vec2(3.0, 1.4) + uSeed;
          float n = noise(p + vec2(uTime * 0.03, uTime * 0.012));
          n = n * 0.6 + noise(p * 2.7 - vec2(uTime * 0.02, 0.0)) * 0.4;
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x)
                     * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = smoothstep(0.35, 0.85, n) * edge * uOp;
          gl_FragColor = vec4(uTint, a);
        }
      `,
    });
    mats.push(m);
    return m;
  };

  const group = new THREE.Group();
  for (let z = 0; z > STREET.zEnd; z -= 30) {
    const cx = centerX(z);
    const tint = rng() < 0.5 ? '#0d2535' : (rng() < 0.5 ? '#251225' : '#102028');
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 12),
      mat(tint, 0.03 + rng() * 0.03)
    );
    sheet.position.set(cx + (rng() - 0.5) * 6, 7 + rng() * 5, z);
    sheet.userData.noReflect = true;
    group.add(sheet);
  }
  scene.add(group);
  return { update(t) { mats.forEach(m => (m.uniforms.uTime.value = t)); } };
}

/* ------------------------ distance haze cards ----------------------- */
/* Huge soft additive glows down the avenue: the city's luminous murk.   */

export function createHazeCards(scene) {
  const tex = glowTexture();
  const group = new THREE.Group();
  const defs = [
    { z: -85, w: 60, h: 30, y: 7, color: '#15303f', op: 0.1 },
    { z: -120, w: 90, h: 46, y: 10, color: '#1b4258', op: 0.16 },
    { z: -150, w: 100, h: 52, y: 12, color: '#2c3550', op: 0.18 },
    { z: -185, w: 130, h: 66, y: 16, color: '#33304e', op: 0.22 },
    { z: -215, w: 150, h: 80, y: 18, color: '#402a44', op: 0.26 },
    { z: -255, w: 190, h: 110, y: 26, color: '#46303e', op: 0.34 },
    { z: -300, w: 260, h: 150, y: 40, color: '#3c2c4a', op: 0.4 },
  ];
  for (const d of defs) {
    const m = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(d.color),
      transparent: true,
      opacity: d.op,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), m);
    mesh.position.set(centerX(d.z), d.y, d.z);
    group.add(mesh);
  }
  scene.add(group);
}

/* ----------------------------- steam ------------------------------- */

export function createSteam(scene) {
  const rng = mulberry32(99);
  const tex = smokeTexture();
  const emitters = [];
  const group = new THREE.Group();

  const spots = [];
  for (let z = -8; z > STREET.zEnd + 20; z -= 26 + rng() * 22) {
    spots.push({
      x: centerX(z) + (rng() - 0.5) * 10,
      z,
      tint: rng() < 0.4 ? '#2a4a5a' : (rng() < 0.5 ? '#4a2a3e' : '#3a3a4a'),
    });
  }

  for (const s of spots) {
    const puffs = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color(s.tint).multiplyScalar(2.4),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        rotation: rng() * Math.PI * 2,
      });
      const sp = new THREE.Sprite(m);
      sp.userData.noReflect = true;
      sp.position.set(s.x, 0, s.z);
      group.add(sp);
      puffs.push({ sp, phase: i / n, drift: (rng() - 0.5) * 0.8, rot: (rng() - 0.5) * 0.4 });
    }
    emitters.push({ ...s, puffs, speed: 0.06 + rng() * 0.05 });
  }
  scene.add(group);

  return {
    update(t) {
      for (const e of emitters) {
        for (const p of e.puffs) {
          const life = (t * e.speed + p.phase) % 1;
          const sz = 1.2 + life * 5.5;
          p.sp.position.set(e.x + p.drift * life * 3.0, life * 5.0, e.z);
          p.sp.scale.set(sz, sz, 1);
          p.sp.material.opacity = Math.sin(life * Math.PI) * 0.34 * (1 - life * 0.4);
          p.sp.material.rotation += p.rot * 0.003;
        }
      }
    },
  };
}

/* --------------------------- dust motes ---------------------------- */

export function createMotes(scene) {
  const COUNT = 420;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 24;
    positions[i * 3 + 1] = Math.random() * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uCam;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.8;
        p.y += sin(uTime * 0.2 + aSeed * 31.0) * 0.5;
        p.z += cos(uTime * 0.25 + aSeed * 17.0) * 0.8;
        // wrap around camera
        vec3 rel = mod(p - uCam + 12.0, 24.0) - 12.0;
        vec3 world = uCam + rel;
        world.y = mod(p.y + uCam.y * 0.0, 10.0);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        float d = -mv.z;
        vA = smoothstep(1.0, 3.0, d) * smoothstep(14.0, 8.0, d) * (0.25 + aSeed * 0.5);
        gl_PointSize = (1.5 + aSeed * 2.5) * (10.0 / max(d, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.0);
        gl_FragColor = vec4(vec3(0.7, 0.85, 1.0), a * vA * 0.35);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noReflect = true;
  scene.add(pts);
  return {
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(camera.position);
    },
  };
}
