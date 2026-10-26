import * as THREE from 'three';
import { CONFIG, clamp01, lerp, smoothstep, smootherstep } from './config.js';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _dir = new THREE.Vector3();

// Slerp between two offset vectors: the camera swings around the rocket on an arc
// instead of cutting through it.
function slerpVectors(a, b, t, out) {
  const la = a.length();
  const lb = b.length();
  const na = a.clone().divideScalar(la);
  const nb = b.clone().divideScalar(lb);
  const omega = Math.acos(THREE.MathUtils.clamp(na.dot(nb), -1, 1));
  if (omega < 1e-4) return out.copy(na).multiplyScalar(lerp(la, lb, t));
  const s = Math.sin(omega);
  return out
    .copy(na).multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(nb, Math.sin(t * omega) / s)
    .multiplyScalar(lerp(la, lb, t));
}

// Rocket attitude for a given pitch-over angle: rolled 90° (boosters left/right),
// then pitched from straight up (+Y) towards the flight direction (-Z).
export function flightAttitude(theta, out) {
  return out.copy(_qa.setFromAxisAngle(X, -theta)).multiply(_qb.setFromAxisAngle(Y, Math.PI / 2));
}

// Seamless hand-off from the ascent to the gameplay chase camera.
export class Transition {
  constructor(ctx) {
    this.ctx = ctx;
    this.camOffset0 = new THREE.Vector3();
    this.look0 = new THREE.Vector3();
    this.camOffsetEnd = new THREE.Vector3();
    this.lookEnd = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.offset = new THREE.Vector3();
  }

  start(launchSpeed) {
    const { rocket, camRig } = this.ctx;
    const G = CONFIG.game;
    this.t = 0;
    this.v0 = launchSpeed;
    this.separated = false;
    this.hudShown = false;
    this.camOffset0.copy(camRig.pos).sub(rocket.rig.position);
    this.look0.copy(camRig.look).sub(rocket.rig.position);
    this.camOffsetEnd.set(0, G.camUp, G.camBack);
    this.lookEnd.set(0, 0, -G.lookAhead);
  }

  get progress() {
    return clamp01(this.t / CONFIG.transition.duration);
  }

  // Returns true when the rocket is in the gameplay pose.
  update(dt) {
    const { rocket, exhaust, camRig, hud, scene, fx } = this.ctx;
    const C = CONFIG.transition;
    this.t += dt;
    const u = this.progress;

    // pitch over while easing from launch speed to cruise speed
    const theta = (Math.PI / 2) * smootherstep(u / 0.85);
    const speed = lerp(this.v0, CONFIG.game.speedStart, smoothstep(0, 1, u));
    _dir.set(0, Math.cos(theta), -Math.sin(theta));
    this.velocity.copy(_dir).multiplyScalar(speed);
    rocket.rig.position.addScaledVector(this.velocity, dt);
    flightAttitude(theta, rocket.attitude.quaternion);

    exhaust.velocity.copy(this.velocity);
    exhaust.vacuum = lerp(0.6, 1, smoothstep(0, 0.8, u));
    exhaust.atmosphere = Math.max(0, 0.4 - u);

    if (!this.separated && u >= C.boosterSep) {
      this.separated = true;
      rocket.separateBoosters(this.velocity, scene);
      exhaust.cutoff('srb', 0.35);
      exhaust.separationPuffs();
      hud.callout('Booster-Trennung');
      fx.impulse = Math.max(fx.impulse, 0.5);
      this.ctx.sound.asteroidHit();
    }

    // camera: swing from the side/below view to behind and above the rocket
    const e = smootherstep(u);
    slerpVectors(this.camOffset0, this.camOffsetEnd, e, this.offset);
    camRig.pos.copy(rocket.rig.position).add(this.offset);
    camRig.look.copy(rocket.rig.position).add(_dir.lerpVectors(this.look0, this.lookEnd, e));
    fx.shake = lerp(0.15, 0.03, u);

    if (!this.hudShown && u > 0.6) {
      this.hudShown = true;
      hud.showHud(true);
    }
    return u >= 1;
  }
}
