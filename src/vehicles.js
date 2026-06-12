import * as THREE from 'three';
import { mulberry32, fogUniforms, GLSL_FOG } from './config.js';

/**
 * Air traffic: light streaks gliding along sky lanes. Each vehicle is a tiny
 * emissive body plus a long fading light trail (additive plane, camera-faced
 * around its lane axis is approximated by double-sided planes since they're
 * far away).
 */
export function createVehicles(scene) {
  const rng = mulberry32(808);
  const group = new THREE.Group();
  const vehicles = [];

  const trailMat = (colorA, colorB) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColA: { value: new THREE.Color(colorA) },
      uColB: { value: new THREE.Color(colorB) },
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
      varying vec2 vUv;
      varying float vViewDepth;
      uniform vec3 uColA, uColB;
      ${GLSL_FOG}
      void main() {
        // head at uv.x=1, tail fades to 0
        float head = pow(vUv.x, 2.4);
        float core = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.0);
        vec3 col = mix(uColB, uColA, vUv.x) * head * core * 4.5;
        col = attenFog(col, vViewDepth * 0.35);
        // dissolve when too close so trails never read as solid pills
        float nearFade = smoothstep(14.0, 42.0, vViewDepth);
        gl_FragColor = vec4(col, head * core * nearFade);
      }
    `,
  });

  // lanes: mostly crossing the street axis at altitude, a couple along it
  const LANES = [];
  for (let i = 0; i < 9; i++) {
    const along = rng() < 0.3;
    const z = -110 - rng() * 180;
    LANES.push({
      along,
      y: 24 + rng() * Math.min((-z - 60) * 0.4, 70),
      z,
      x: (rng() - 0.5) * 160,
      dir: rng() < 0.5 ? 1 : -1,
      span: 360,
    });
  }
  // a couple of low canyon-crossers right over the street for drama
  LANES.push({ along: false, y: 24, z: -60, x: 0, dir: 1, span: 240 });
  LANES.push({ along: false, y: 30, z: -135, x: 0, dir: -1, span: 240 });

  const bodyGeo = new THREE.BoxGeometry(1.6, 0.4, 0.8);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x05070c });

  for (let i = 0; i < 42; i++) {
    const lane = LANES[Math.floor(rng() * LANES.length)];
    const speed = (9 + rng() * 16) * lane.dir;
    const isCop = rng() < 0.1;
    const headCol = isCop ? '#ff3b30' : '#cfe8ff';
    const tailCol = isCop ? '#3b6cff' : '#ff4a3a';

    const v = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    v.add(body);

    const len = 12 + rng() * 16;
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.8), trailMat(headCol, tailCol));
    trail.position.x = -len / 2 * Math.sign(speed);
    if (speed < 0) trail.rotation.y = Math.PI;
    v.add(trail);
    // vertical copy for visibility from below
    const trail2 = trail.clone();
    trail2.rotation.x = Math.PI / 2;
    v.add(trail2);

    const off = rng() * lane.span;
    vehicles.push({ v, lane, speed, off, bob: rng() * 10 });
    v.userData.noReflect = false;
    group.add(v);
  }

  // ---- distant traffic streams: ribbons of moving dashes ----
  const streamMats = [];
  const streamMat = (dir) => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uDir: { value: dir }, uSeed: { value: rng() * 10 }, ...fogUniforms() },
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
        varying vec2 vUv;
        varying float vViewDepth;
        uniform float uTime, uDir, uSeed;
        ${GLSL_FOG}
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float lanePos = vUv.x * 40.0; // dash space
          float speed = 1.6 + hash(uSeed) * 1.2;
          float p = lanePos - uTime * speed * uDir;
          float cell = floor(p);
          float dash = smoothstep(0.45, 0.2, abs(fract(p) - 0.5)) * step(0.45, hash(cell + uSeed));
          float core = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 1.6);
          vec3 col = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.35, 0.25), step(0.0, -uDir));
          vec3 final = col * dash * core * 2.6;
          final = attenFog(final, vViewDepth * 0.3);
          gl_FragColor = vec4(final, dash * core);
        }
      `,
    });
    streamMats.push(m);
    return m;
  };

  // keep streams in the band of sky the walker actually sees:
  // far down the avenue, at modest elevation
  for (let i = 0; i < 8; i++) {
    const z = -170 - rng() * 160;
    const y = 30 + (-z - 170) * 0.25 + rng() * 30;
    const dir = rng() < 0.5 ? 1 : -1;
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(420, 1.1), streamMat(dir));
    ribbon.position.set(0, y, z);
    ribbon.rotation.z = (rng() - 0.5) * 0.05;
    group.add(ribbon);
    // faint vertical twin so it reads from below
    const r2 = ribbon.clone();
    r2.rotation.x = Math.PI / 2;
    group.add(r2);
  }

  scene.add(group);

  return {
    update(t) {
      for (const m of streamMats) m.uniforms.uTime.value = t;
      for (const veh of vehicles) {
        const { lane, speed } = veh;
        const s = ((t * Math.abs(speed) + veh.off) % lane.span) - lane.span / 2;
        const p = lane.along
          ? [lane.x * 0.2, lane.y, -130 + s * Math.sign(speed)]
          : [s * Math.sign(speed), lane.y, lane.z];
        veh.v.position.set(p[0], p[1] + Math.sin(t * 0.8 + veh.bob) * 0.6, p[2]);
        veh.v.rotation.y = lane.along ? Math.PI / 2 : 0;
      }
    },
  };
}
