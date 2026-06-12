import * as THREE from 'three';
import { STREET, centerX, mulberry32, fogUniforms, GLSL_FOG } from './config.js';

/**
 * Pedestrians: dark silhouettes with umbrellas, rim-lit by the street neon.
 * No faces, no detail — just believable shapes moving through the murk.
 */

function rimMaterial(rimColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRim: { value: new THREE.Color(rimColor) },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vViewDepth;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        vViewDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying float vViewDepth;
      uniform vec3 uRim;
      ${GLSL_FOG}
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.5);
        vec3 col = vec3(0.004, 0.006, 0.01) + uRim * rim * 0.35;
        col = applyFog(col, vViewDepth);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function createPeople(scene) {
  const rng = mulberry32(1212);
  const group = new THREE.Group();
  const peds = [];

  const rimColors = ['#ff2d78', '#19e3ff', '#ff9a1f', '#b44bff', '#7dffb2'];
  const bodyGeo = new THREE.CapsuleGeometry(0.21, 1.05, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.11, 8, 8);
  const brellaGeo = new THREE.ConeGeometry(0.58, 0.24, 9);
  const stickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4);

  const N = 30;
  for (let i = 0; i < N; i++) {
    const mat = rimMaterial(rimColors[Math.floor(rng() * rimColors.length)]);
    const ped = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.85;
    // slight shoulder slump
    body.scale.set(1, 1, 0.75);
    ped.add(body);

    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.62;
    ped.add(head);

    const hasUmbrella = rng() < 0.75;
    if (hasUmbrella) {
      const brella = new THREE.Mesh(brellaGeo, mat);
      brella.position.set(0.08, 1.95, 0.05);
      brella.rotation.z = -0.12;
      ped.add(brella);
      const stick = new THREE.Mesh(stickGeo, mat);
      stick.position.set(0.16, 1.45, 0.05);
      ped.add(stick);
    }

    const dir = rng() < 0.5 ? 1 : -1;
    const side = rng() < 0.5 ? -1 : 1;
    const lane = side * (STREET.halfWidth - 1.0 - rng() * 2.2);
    const speed = (0.55 + rng() * 0.6) * dir;
    const z0 = STREET.zStart - 10 - rng() * (STREET.zStart - STREET.zEnd - 24);
    const phase = rng() * 10;
    const scale = 0.92 + rng() * 0.16;
    ped.scale.setScalar(scale);

    ped.rotation.y = dir > 0 ? 0 : Math.PI;
    group.add(ped);
    peds.push({ ped, lane, speed, z0, phase });
  }

  scene.add(group);

  return {
    update(t) {
      const range = STREET.zStart - STREET.zEnd - 20;
      for (const p of peds) {
        let z = p.z0 + p.speed * t;
        // wrap within the street extent
        z = STREET.zStart - 8 - (((STREET.zStart - 8 - z) % range) + range) % range;
        const x = centerX(z) + p.lane;
        const step = Math.abs(Math.sin(t * 2.2 + p.phase));
        p.ped.position.set(x, step * 0.035, z);
        p.ped.rotation.z = Math.sin(t * 2.2 + p.phase) * 0.015;
      }
    },
  };
}
