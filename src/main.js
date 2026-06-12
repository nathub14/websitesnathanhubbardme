import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, ChromaticAberrationEffect, VignetteEffect, NoiseEffect,
  SMAAEffect, ToneMappingEffect, ToneMappingMode, BlendFunction,
  HueSaturationEffect, BrightnessContrastEffect,
} from 'postprocessing';
import { STREET, centerX, FOG_COLOR, FOG_DENSITY } from './config.js';
import { createCity, createCables } from './city.js';
import { createGround } from './ground.js';
import {
  createBladeSigns, createWallSigns, createHoloBillboards,
  createOracleOrb, createLamps, createStreetProps, updateSigns,
} from './signs.js';
import { createRain } from './rain.js';
import { createSky, createFogSheets, createSteam, createMotes, createHazeCards } from './atmosphere.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createAudio } from './audio.js';

/* ------------------------------ renderer ------------------------------ */

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // tone mapped in post
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = FOG_COLOR.clone();

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 2, 24);

/* ------------------------------- world -------------------------------- */

const city = createCity(scene);
createCables(scene);
const ground = createGround(scene, renderer, camera);
createBladeSigns(scene, city.plots);
createWallSigns(scene, city.plots);
createHoloBillboards(scene);
createOracleOrb(scene);
createLamps(scene);
createStreetProps(scene);
const rain = createRain(scene);
const sky = createSky(scene);
createHazeCards(scene);
const fogSheets = createFogSheets(scene);
const steam = createSteam(scene);
const motes = createMotes(scene);
const vehicles = createVehicles(scene);
const people = createPeople(scene);

/* ------------------------------- post ---------------------------------- */

const composer = new EffectComposer(renderer, {
  frameBufferType: THREE.HalfFloatType,
});
composer.addPass(new RenderPass(scene, camera));

const bloom = new BloomEffect({
  intensity: 1.45,
  luminanceThreshold: 0.2,
  luminanceSmoothing: 0.5,
  mipmapBlur: true,
  radius: 0.75,
});
const chroma = new ChromaticAberrationEffect({
  offset: new THREE.Vector2(0.0011, 0.0007),
  radialModulation: true,
  modulationOffset: 0.3,
});
const vignette = new VignetteEffect({ darkness: 0.62, offset: 0.28 });
const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
grain.blendMode.opacity.value = 0.14;
const smaa = new SMAAEffect();
const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
const grade = new HueSaturationEffect({ saturation: 0.12 });
const punch = new BrightnessContrastEffect({ brightness: -0.015, contrast: 0.09 });

composer.addPass(new EffectPass(camera, bloom, chroma, tone));
composer.addPass(new EffectPass(camera, grade, punch, vignette, grain, smaa));

/* ------------------------------ camera rig ----------------------------- */
/* Scroll scrubs a target distance along the street; spring-damped follow. */

const PATH_START = 22;
const PATH_END = STREET.zEnd + 62; // stop while the vista ahead is still rich
const PATH_LEN = PATH_START - PATH_END; // walking in -z

let scrollT = 0;        // 0..1 target from scrollbar
let walkT = 0;          // damped
let lookX = 0, lookY = 0;       // mouse look targets
let lookXs = 0, lookYs = 0;     // smoothed
let lastInteract = 0;
let autoDrift = 0;

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollT = max > 0 ? window.scrollY / max : 0;
  lastInteract = performance.now();
}
window.addEventListener('scroll', onScroll, { passive: true });

window.addEventListener('pointermove', (e) => {
  lookX = (e.clientX / window.innerWidth - 0.5) * 2;
  lookY = (e.clientY / window.innerHeight - 0.5) * 2;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

function pathPoint(t, out) {
  const z = PATH_START - t * PATH_LEN;
  // wander gently within the street
  const x = centerX(z) + Math.sin(z * 0.05 + 1.7) * 2.2;
  out.set(x, 0, z);
  return out;
}

const camPos = new THREE.Vector3();
const ahead = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

/* -------------------------------- HUD ---------------------------------- */

const hud = document.getElementById('hud');
const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');
const roGrid = document.getElementById('ro-grid');
const roTime = document.getElementById('ro-time');
const roBar = document.getElementById('ro-bar');

createAudio(document.getElementById('sound-btn'));

const bootLines = [
  'CALIBRATING OPTICS…',
  'SYNCING DISTRICT GRID…',
  'RAIN INDEX: HEAVY',
  'WELCOME TO VELA.',
];
bootLines.forEach((line, i) => setTimeout(() => (bootStatus.textContent = line), 600 + i * 520));
let clockMin = 167; // 02:47

setTimeout(() => {
  boot.classList.add('off');
  hud.classList.add('on');
}, 600 + bootLines.length * 520 + 400);

setInterval(() => {
  clockMin = (clockMin + 1) % 1440;
  roTime.textContent =
    String(Math.floor(clockMin / 60)).padStart(2, '0') + ':' + String(clockMin % 60).padStart(2, '0');
}, 4000);

/* ------------------------------- loop ---------------------------------- */

const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;

  // auto-walk when idle
  if (performance.now() - lastInteract > 6000) {
    autoDrift = Math.min(autoDrift + dt * 0.002, 0.0045);
  } else {
    autoDrift = 0;
  }
  if (autoDrift > 0 && scrollT < 1) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollBy(0, autoDrift * max * dt);
  }

  // damped walk
  walkT += (scrollT - walkT) * (1 - Math.exp(-dt * 2.2));

  pathPoint(walkT, camPos);
  pathPoint(Math.min(walkT + 0.02, 1), ahead);

  // head bob from distance walked
  const dist = walkT * PATH_LEN;
  const bobY = Math.sin(dist * 1.9) * 0.045;
  const bobX = Math.cos(dist * 0.95) * 0.03;

  camera.position.set(camPos.x + bobX, 1.9 + bobY, camPos.z);

  // smoothed mouse look
  lookXs += (lookX - lookXs) * (1 - Math.exp(-dt * 3.0));
  lookYs += (lookY - lookYs) * (1 - Math.exp(-dt * 3.0));

  lookTarget.set(
    ahead.x + lookXs * 6.0,
    2.1 - lookYs * 3.2 + bobY * 0.5,
    ahead.z
  );
  camera.lookAt(lookTarget);
  // subtle dutch tilt from look
  camera.rotation.z += lookXs * 0.015;

  // world updates
  city.update(t);
  ground.update(t);
  updateSigns(t);
  rain.update(t, camera);
  sky.update(t);
  fogSheets.update(t);
  steam.update(t);
  motes.update(t, camera);
  vehicles.update(t);
  people.update(t);

  // HUD readouts
  if (roGrid && (tickCount & 15) === 0) {
    roGrid.textContent = `7F-${String(Math.floor(21 + walkT * 240)).padStart(4, '0')}`;
    roBar.style.width = `${(walkT * 100).toFixed(1)}%`;
  }
  tickCount++;

  composer.render(dt);
}
let tickCount = 0;
tick();

// expose for the screenshot tool: jump to a position instantly
window.__vela = {
  jump(tt) {
    scrollT = tt; walkT = tt;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, tt * max);
    lastInteract = performance.now();
  },
  setTime(tt) { elapsed = tt; },
};
