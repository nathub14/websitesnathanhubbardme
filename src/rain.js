import * as THREE from 'three';

/**
 * GPU rain: instanced streak quads in a cylinder that follows the camera.
 * Position is computed in the vertex shader from per-instance seeds, so the
 * CPU does nothing per-frame except update time + camera position.
 */
export function createRain(scene) {
  const COUNT = 2600;
  const RADIUS = 26;
  const HEIGHT = 24;

  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.attributes.uv = base.attributes.uv;

  const seeds = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    seeds[i * 3] = Math.random();       // angle
    seeds[i * 3 + 1] = Math.random();   // radius
    seeds[i * 3 + 2] = Math.random();   // phase/speed
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  geo.instanceCount = COUNT;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uRadius: { value: RADIUS },
      uHeight: { value: HEIGHT },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime, uRadius, uHeight;
      uniform vec3 uCam;
      varying float vAlpha;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        float ang = aSeed.x * 6.28318;
        float rad = sqrt(aSeed.y) * uRadius;
        float speed = 16.0 + aSeed.z * 10.0;
        float len = 0.45 + aSeed.z * 0.5;

        // anchor cylinder to camera on a coarse grid so drops don't swim
        vec3 anchor = vec3(uCam.x + cos(ang) * rad, 0.0, uCam.z + sin(ang) * rad);
        float y = mod(aSeed.z * 97.0 - uTime * speed, uHeight);

        // wind shear
        vec2 wind = vec2(0.12, 0.05) * speed * 0.06;

        // billboard the streak toward the camera (cylindrical)
        vec3 toCam = normalize(vec3(uCam.x, 0.0, uCam.z) - anchor);
        vec3 right = normalize(vec3(-toCam.z, 0.0, toCam.x));

        vec3 p = anchor
          + right * position.x * 0.022
          + vec3(wind.x, 1.0, wind.y) * position.y * len
          + vec3(0.0, y, 0.0);

        float distToCam = length(p.xz - uCam.xz);
        // fade very close & far streaks
        vAlpha = smoothstep(0.4, 2.0, distToCam) * smoothstep(uRadius, uRadius * 0.6, distToCam);
        vAlpha *= 0.5;

        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec2 vUv;
      void main() {
        float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float tail = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        vec3 col = vec3(0.62, 0.78, 0.92);
        gl_FragColor = vec4(col, vAlpha * core * tail);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.noReflect = true;
  scene.add(mesh);

  return {
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(camera.position);
    },
  };
}
