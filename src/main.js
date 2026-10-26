import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { CONFIG, IS_MOBILE, QUALITY, lerp, smoothstep } from './config.js';
import { loadRocketModel } from './rocketModel.js';
import { Environment } from './environment.js';
import { ParticleSystem, makeSpriteTexture } from './particles.js';
import { Exhaust } from './exhaust.js';
import { Launch } from './launch.js';
import { Transition } from './transition.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sound } from './audio.js';

const stage = document.getElementById('stage');
const hud = new Hud();
const sound = new Sound();
hud.setMuted(sound.muted);
const input = new Input(stage, document.getElementById('joystick'), document.getElementById('joystick-knob'));
const TEST = new URLSearchParams(location.search).has('test');

// ---------- renderer ----------
let pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY.maxPixelRatio);
const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = QUALITY.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 2, 1.2e6);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

let composer = null;
let bloom = null;
if (QUALITY.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 1.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6f5d48, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1de, 2.6);
scene.add(sun, sun.target);

// ---------- shared context ----------
const ctx = {
  scene,
  camera,
  renderer,
  hud,
  sound,
  input,
  camRig: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
  fx: { shake: 0, impulse: 0 },
  timeUniform: { value: 0 },
  particles: {
    smoke: new ParticleSystem({ max: QUALITY.smoke, texture: makeSpriteTexture('smoke') }),
    fire: new ParticleSystem({ max: QUALITY.fire, texture: makeSpriteTexture('fire'), additive: true }),
    sparks: new ParticleSystem({ max: QUALITY.sparks, texture: makeSpriteTexture('spark'), additive: true }),
  },
};
for (const p of Object.values(ctx.particles)) scene.add(p.mesh);

const env = new Environment(scene, { starCount: QUALITY.stars, pixelRatio });
ctx.env = env;

let state = 'loading';
let timeScale = 1;
let launch;
let transition;
let game;

function setupSun(target) {
  sun.position.copy(target).addScaledVector(env.sunDir, 3000);
  sun.target.position.copy(target);
  if (!QUALITY.shadows) return;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -750; s.right = 750; s.top = 750; s.bottom = -750;
  s.near = 500; s.far = 6000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
}

async function init() {
  const rocket = await loadRocketModel((p) => hud.setLoading(p));
  ctx.rocket = rocket;
  hud.setLoading(1);
  hud.setLoadingText('Szene wird vorbereitet …');
  scene.add(rocket.rig);
  env.attachLaunchSite(rocket.pad, rocket.padPivot);
  setupSun(rocket.padPivot);

  ctx.exhaust = new Exhaust(ctx);
  launch = new Launch(ctx);
  transition = new Transition(ctx);
  game = new Game(ctx, { onGameOver: showGameOver });

  launch.updateTitle(0);
  applyCamera(0);
  // compile every shader up front (hidden effects included) so nothing stutters mid-flight
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  await renderer.compileAsync(scene, camera);
  for (const o of hidden) o.visible = false;

  hud.hideLoading();
  goTitle();
  renderer.setAnimationLoop(loop);
}

// ---------- state changes ----------
function bestKm() {
  try {
    return parseInt(localStorage.getItem(CONFIG.storage.best) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function goTitle() {
  state = 'title';
  timeScale = 1;
  hud.showTitle(bestKm());
  hud.showSkip(false);
  hud.showHud(false);
  hud.setCountdown(null);
}

function startLaunch() {
  if (state !== 'title') return;
  sound.unlock();
  hud.hideTitle();
  hud.showSkip(true);
  launch.start();
  state = 'launch';
}

function skipLaunch() {
  if (state === 'launch') timeScale = 6;
}

function beginTransition() {
  timeScale = 1;
  hud.showSkip(false);
  hud.setStats(0, CONFIG.game.speedStart * CONFIG.game.kmPerUnit, game.best);
  transition.start(launch.speed);
  state = 'transition';
}

function beginGame() {
  ctx.rocket.pad.visible = false;
  game.begin(ctx.rocket.rig.position);
  state = 'game';
  hud.callout(IS_MOBILE ? 'Ziehen zum Ausweichen' : 'Ausweichen mit WASD / Pfeiltasten', 3);
}

function showGameOver(km, best, record) {
  hud.showHud(false);
  hud.showGameOver(km, best, record);
}

function retry() {
  if (state !== 'game' || game.state !== 'over') return;
  hud.hideGameOver();
  hud.showHud(true);
  game.retry();
}

function goHome() {
  if (state !== 'game' || game.state !== 'over') return;
  hud.hideGameOver();
  game.stop();
  ctx.rocket.reset();
  ctx.exhaust.reset();
  for (const p of Object.values(ctx.particles)) p.clear();
  ctx.rocket.pad.visible = true;
  ctx.fx.impulse = 0;
  launch.reset();
  goTitle();
}

document.getElementById('btn-retry').addEventListener('click', retry);
document.getElementById('btn-home').addEventListener('click', goHome);

document.getElementById('btn-start').addEventListener('click', startLaunch);
document.getElementById('btn-skip').addEventListener('click', skipLaunch);
document.getElementById('btn-mute').addEventListener('click', () => hud.setMuted(sound.toggleMute()));

input.onKey = (code) => {
  if (code === 'KeyM') hud.setMuted(sound.toggleMute());
  if (code === 'Space' || code === 'Enter') {
    if (state === 'title') startLaunch();
    else retry();
  }
  if (code === 'KeyR') retry();
  if (code === 'KeyL' || code === 'Escape') goHome();
};

// ---------- frame ----------
let time = 0;

function update(dtReal) {
  const dt = Math.min(dtReal, 1 / 20);
  const simDt = state === 'launch' ? dt * timeScale : dt;
  time += simDt;
  ctx.timeUniform.value = time;
  const { rocket, exhaust } = ctx;

  if (state === 'title') {
    launch.updateTitle(dt);
  } else if (state === 'launch') {
    if (launch.update(simDt)) beginTransition();
  } else if (state === 'transition') {
    if (transition.update(dt)) beginGame();
  } else if (state === 'game') {
    game.update(dt);
  }
  input.setStickEnabled(state === 'game' && game.state === 'playing');

  rocket.updateDebris(simDt);
  exhaust.update(simDt);
  for (const p of Object.values(ctx.particles)) p.update(simDt);
  hud.update(dt);

  // sky and earth follow altitude; after the pitch-over we are in space for good
  const alt = rocket.altitude;
  let spaceT = smoothstep(CONFIG.sky.spaceFrom, CONFIG.sky.spaceTo, alt);
  if (state === 'transition') spaceT = Math.max(spaceT, transition.progress);
  else if (state !== 'title' && state !== 'launch') spaceT = 1;
  env.update(simDt, camera, {
    spaceT,
    altitude: alt,
    flightDz: rocket.rig.position.z - rocket.padPivot.z,
    earthDrop: game.flown * CONFIG.game.earthRecede,
    speed: state === 'game' ? game.speed : CONFIG.game.speedStart,
    streaks: state === 'transition' ? smoothstep(0.8, 1, transition.progress) : state === 'game' ? game.speed / CONFIG.game.speedStart : 0,
  });
  hemi.intensity = lerp(0.9, 0.1, spaceT);
  scene.environmentIntensity = lerp(1, 0.35, spaceT);
  if (QUALITY.shadows) renderer.shadowMap.autoUpdate = alt < 2500;
  sound.setEngine(Math.max(exhaust.throttle.srb, exhaust.throttle.rs25 * 0.6), 1 - spaceT);

  applyCamera(simDt);
}

const _shake = new THREE.Vector3();
function applyCamera(dt) {
  const { fx, camRig } = ctx;
  fx.impulse *= Math.exp(-2.5 * dt);
  const s = fx.shake + fx.impulse;
  camera.position.copy(camRig.pos);
  camera.lookAt(camRig.look);
  if (s > 0.001) {
    const t = time;
    _shake.set(
      Math.sin(t * 61.3) + Math.sin(t * 23.7) * 0.6,
      Math.sin(t * 57.1 + 1.3) + Math.sin(t * 19.3) * 0.6,
      Math.sin(t * 49.9 + 2.1) * 0.5,
    ).multiplyScalar(s * 3.5);
    camera.position.add(_shake);
    camera.rotateZ(Math.sin(t * 37.0) * 0.004 * s);
  }
}

function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// If the device can't hold ~45 fps, trade resolution (then bloom) for frame rate.
let perfTime = 0;
let perfFrames = 0;
function adaptQuality(dt) {
  if (state === 'title' || dt > 0.25) return; // ignore tab switches
  perfTime += dt;
  perfFrames++;
  if (perfTime < 2) return;
  const avg = perfTime / perfFrames;
  perfTime = 0;
  perfFrames = 0;
  if (avg < 1 / 45) return;
  if (pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    if (composer) composer.setPixelRatio(pixelRatio);
    env.setPixelRatio(pixelRatio);
    resize();
  } else if (composer) {
    composer = null;
  }
}

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  update(dt);
  render();
  adaptQuality(dt);
}

// ---------- resize / visibility ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.8 ? 72 : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.suspend();
  else {
    sound.resume();
    last = performance.now();
  }
});

if (TEST) {
  window.__t = {
    ctx,
    get state() { return state; },
    get game() { return game; },
    startLaunch,
    skipLaunch,
    retry,
    goHome,
    setInput(x, y) { input.override = x === null ? null : { x, y }; },
    // drops a rock straight into the rocket's path (dx/dy relative to the rocket)
    spawnRock(dist, dx = 0, dy = 0, r = 80) {
      const p = ctx.rocket.rig.position;
      game.asteroids.spawn(game.anchor, p, dist, 0);
      const a = game.asteroids.list[game.asteroids.list.length - 1];
      a.pos.set(p.x + dx, p.y + dy, p.z - dist);
      a.vel.set(0, 0, 0);
      a.r = r;
      a.hitR = r * 0.85;
      a.scale.setScalar(r);
    },
    spawnPowerup(dist) {
      const p = ctx.rocket.rig.position;
      game.powerups.spawn(game.anchor, p, dist);
      game.powerups.items[game.powerups.items.length - 1].pos.set(p.x, p.y, p.z - dist);
    },
    step(seconds, dt = 1 / 30) {
      for (let t = 0; t < seconds; t += dt) update(dt);
    },
    render,
    stop() { renderer.setAnimationLoop(null); },
  };
}

init().catch((err) => {
  console.error(err);
  hud.setLoadingText(`Fehler beim Laden: ${err.message}`);
});
