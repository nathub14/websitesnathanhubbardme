import * as THREE from 'three';

// The street canyon runs from +z toward -z with a gentle S-curve.
export const STREET = {
  zStart: 30,
  zEnd: -250,
  halfWidth: 7.5, // distance from centerline to building faces
};

export function centerX(z) {
  return Math.sin(z * 0.022) * 7.0;
}

// Same curve, for GLSL.
export const GLSL_CENTER_X = /* glsl */ `
float streetCenterX(float z) { return sin(z * 0.022) * 7.0; }
`;

export const FOG_COLOR = new THREE.Color(0x10293c);
export const FOG_DENSITY = 0.011;

// Shared exp2 fog snippet for custom ShaderMaterials.
// applyFog: opaque surfaces (mix toward fog color).
// attenFog: additive/emissive transparents (attenuate only, never add fog).
export const GLSL_FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 applyFog(vec3 color, float viewDepth) {
  float f = 1.0 - exp(-uFogDensity * uFogDensity * viewDepth * viewDepth);
  return mix(color, uFogColor, clamp(f, 0.0, 1.0));
}
vec3 attenFog(vec3 color, float viewDepth) {
  float f = exp(-uFogDensity * uFogDensity * viewDepth * viewDepth);
  return color * clamp(f, 0.0, 1.0);
}
`;

export const PALETTE = {
  pink: new THREE.Color('#ff2d78'),
  cyan: new THREE.Color('#19e3ff'),
  orange: new THREE.Color('#ff9a1f'),
  violet: new THREE.Color('#b44bff'),
  red: new THREE.Color('#ff3b30'),
  mint: new THREE.Color('#7dffb2'),
  warmWhite: new THREE.Color('#ffd9a0'),
};

export function fogUniforms() {
  return {
    uFogColor: { value: FOG_COLOR.clone() },
    uFogDensity: { value: FOG_DENSITY },
  };
}

// Deterministic pseudo-random helpers so the city is stable between loads.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
