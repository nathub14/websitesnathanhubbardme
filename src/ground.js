import * as THREE from 'three';
import { fogUniforms, GLSL_FOG, GLSL_CENTER_X } from './config.js';
import { noiseTexture } from './textures.js';

/**
 * Wet asphalt with true planar reflection: the scene is mirrored about y=0
 * into a render target every frame, then sampled with ripple distortion,
 * a puddle mask, and distance blur (via RT mipmaps).
 */
export function createGround(scene, renderer, camera) {
  const RES = 1024;
  const rt = new THREE.WebGLRenderTarget(RES, RES, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const reflectorPlane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const lookAtPosition = new THREE.Vector3(0, 0, -1);
  const clipPlane = new THREE.Vector4();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();
  const textureMatrix = new THREE.Matrix4();
  const virtualCamera = new THREE.PerspectiveCamera();

  const noise = noiseTexture(256);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tReflect: { value: rt.texture },
      tNoise: { value: noise },
      uTextureMatrix: { value: textureMatrix },
      uTime: { value: 0 },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      uniform mat4 uTextureMatrix;
      varying vec4 vUvRefl;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vUvRefl = uTextureMatrix * wp;
        vec4 mv = viewMatrix * wp;
        vViewDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tReflect;
      uniform sampler2D tNoise;
      uniform float uTime;
      varying vec4 vUvRefl;
      varying vec3 vWorldPos;
      varying float vViewDepth;
      ${GLSL_FOG}
      ${GLSL_CENTER_X}

      float noise2(vec2 p) { return texture2D(tNoise, p).r; }
      float fbm(vec2 p) {
        return noise2(p) * 0.55 + noise2(p * 2.7) * 0.3 + noise2(p * 7.3) * 0.15;
      }

      void main() {
        vec2 wxz = vWorldPos.xz;

        // --- puddle mask: large-scale blotches, sharper near edges of street
        float pud = fbm(wxz * 0.012 + 3.7);
        float puddle = smoothstep(0.48, 0.62, pud);

        // --- rain ripple normal perturbation (two scrolling layers)
        vec2 r1 = vec2(noise2(wxz * 0.18 + vec2(0.0, uTime * 0.06)),
                       noise2(wxz * 0.18 + vec2(5.2, uTime * 0.05)));
        vec2 r2 = vec2(noise2(wxz * 0.55 - vec2(uTime * 0.04, 0.0)),
                       noise2(wxz * 0.55 + vec2(uTime * 0.045, 2.2)));
        vec2 ripple = (r1 - 0.5) * 0.9 + (r2 - 0.5) * 0.5;

        // expanding raindrop rings inside puddles
        vec2 cellUv = wxz * 0.45;
        vec2 cid = floor(cellUv);
        vec2 cf = fract(cellUv) - 0.5;
        float ch = noise2(cid * 0.037);
        float ringT = fract(uTime * 0.8 + ch * 7.0);
        float rad = length(cf + (vec2(noise2(cid * 0.11), noise2(cid * 0.23)) - 0.5) * 0.5);
        float ring = smoothstep(0.06, 0.0, abs(rad - ringT * 0.45)) * (1.0 - ringT);
        ripple += ring * normalize(cf + 0.0001) * 1.6 * puddle;

        // --- reflection sample with distortion + roughness blur
        float rough = mix(0.85, 0.12, puddle); // puddles are mirror-like
        vec3 distort = vec3(ripple.x, 0.0, ripple.y) * mix(0.35, 0.12, puddle);
        vec4 uvR = vUvRefl;
        uvR.xyz += distort * uvR.w * 0.08;
        float lod = rough * 5.0;
        vec3 refl = texture2DProj(tReflect, uvR, lod).rgb;

        // --- asphalt base
        float grain = noise2(wxz * 1.7) * 0.5 + noise2(wxz * 0.31) * 0.5;
        vec3 asphalt = vec3(0.010, 0.014, 0.022) * (0.6 + 0.8 * grain);

        // worn center line paint, following the curve
        float cx = streetCenterX(vWorldPos.z);
        float lineDist = abs(vWorldPos.x - cx);
        float dash = step(0.5, fract(vWorldPos.z * 0.14));
        float wear = smoothstep(0.3, 0.75, noise2(wxz * 0.4));
        float paint = smoothstep(0.18, 0.1, lineDist) * dash * wear;
        asphalt += vec3(0.45, 0.38, 0.12) * paint * 0.06;
        // sidewalk edge strips
        float edge = smoothstep(0.4, 0.1, abs(lineDist - 6.4));
        asphalt += vec3(0.04, 0.04, 0.05) * edge * grain * 0.15;

        // --- fresnel-ish view-angle reflectivity
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        float reflAmt = mix(0.25 + 0.55 * fres, 0.75 + 0.25 * fres, puddle);

        vec3 col = asphalt + refl * reflAmt * mix(0.55, 1.05, puddle);

        col = applyFog(col, vViewDepth);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const geo = new THREE.PlaneGeometry(900, 900);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, -150);
  scene.add(mesh);

  // hide expensive / irrelevant stuff from the mirror pass via layers
  // (objects can opt out by setting userData.noReflect = true)
  let frameSkip = 0;

  mesh.onBeforeRender = (rendererArg, sceneArg, cameraArg) => {
    if (cameraArg !== camera) return;

    reflectorWorldPosition.setFromMatrixPosition(mesh.matrixWorld);
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    rotationMatrix.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotationMatrix);

    view.subVectors(reflectorWorldPosition, cameraWorldPosition);
    if (view.dot(normal) > 0) return;

    view.reflect(normal).negate();
    view.add(reflectorWorldPosition);

    rotationMatrix.extractRotation(camera.matrixWorld);
    lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
    target.subVectors(reflectorWorldPosition, lookAtPosition);
    target.reflect(normal).negate();
    target.add(reflectorWorldPosition);

    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
    virtualCamera.lookAt(target);
    virtualCamera.far = camera.far;
    virtualCamera.fov = camera.fov;
    virtualCamera.aspect = camera.aspect;
    virtualCamera.near = camera.near;
    virtualCamera.updateProjectionMatrix();
    virtualCamera.updateMatrixWorld();

    textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    textureMatrix.multiply(virtualCamera.projectionMatrix);
    textureMatrix.multiply(virtualCamera.matrixWorldInverse);

    // oblique near-plane clipping so geometry below the plane is cut
    reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
    reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const projectionMatrix = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    projectionMatrix.elements[2] = clipPlane.x;
    projectionMatrix.elements[6] = clipPlane.y;
    projectionMatrix.elements[10] = clipPlane.z + 1.0;
    projectionMatrix.elements[14] = clipPlane.w;

    mesh.visible = false;
    const hidden = [];
    sceneArg.traverse(o => {
      if (o.userData.noReflect && o.visible) { o.visible = false; hidden.push(o); }
    });

    const currentRenderTarget = rendererArg.getRenderTarget();
    const currentXrEnabled = rendererArg.xr.enabled;
    rendererArg.xr.enabled = false;
    rendererArg.setRenderTarget(rt);
    rendererArg.state.buffers.depth.setMask(true);
    if (rendererArg.autoClear === false) rendererArg.clear();
    rendererArg.render(sceneArg, virtualCamera);
    rendererArg.setRenderTarget(currentRenderTarget);
    rendererArg.xr.enabled = currentXrEnabled;

    hidden.forEach(o => (o.visible = true));
    mesh.visible = true;
  };

  return {
    mesh,
    update(t) { mat.uniforms.uTime.value = t; },
  };
}
