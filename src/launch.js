import * as THREE from 'three';
import { CONFIG, lerp, smoothstep } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TAU = Math.PI * 2;

function pickSweep(fromAngle) {
  let best = Math.PI;
  let bestMargin = -Infinity;
  for (let s = Math.PI * 0.75; s <= Math.PI * 1.25; s += 0.02) {
    const end = (((fromAngle - s) % TAU) + TAU) % TAU;
    for (const [a, b] of CONFIG.launch.clearViews) {
      const margin = Math.min(end - a, b - end);
      if (margin > bestMargin) {
        bestMargin = margin;
        best = s;
      }
    }
  }
  return best;
}

export class Launch {
  constructor(ctx) {
    this.ctx = ctx;
    this.titleAngle = 3.5;
    this.velocity = new THREE.Vector3();
    this.liftoffPos = new THREE.Vector3();
    this.hDir = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.t = 0;
    this.lastCount = null;
    this.flags = {};
    this.speed = 0;
    this.velocity.set(0, 0, 0);
  }

  updateTitle(dt) {
    const { title } = CONFIG;
    const p = this.ctx.rocket.padPivot;
    this.titleAngle -= dt * title.speed;
    const a = this.titleAngle;
    this.ctx.camRig.pos.set(p.x + Math.cos(a) * title.radius, title.height, p.z + Math.sin(a) * title.radius);
    this.ctx.camRig.look.set(p.x, title.lookY, p.z);
    this.ctx.fx.shake = 0;
  }

  start() {
    this.reset();
    this.startAngle = this.titleAngle;
    this.sweep = -pickSweep(this.titleAngle);
  }

  update(dt) {
    const L = CONFIG.launch;
    const { rocket, exhaust, hud, sound, camRig, fx } = this.ctx;
    const pad = rocket.padPivot;
    this.t += dt;
    const T = this.t - L.countdown;

    if (T < 0) {
      const n = Math.ceil(-T);
      if (n !== this.lastCount) {
        this.lastCount = n;
        hud.setCountdown(n);
        sound.beep(n <= 3 ? 1046 : 784, 0.09);
      }
    } else if (this.lastCount !== 0) {
      this.lastCount = 0;
      hud.setCountdown(0);
    } else if (T > 1.4) {
      hud.setCountdown(null);
    }

    if (T >= -L.mainEngineStart && !this.flags.rs25) {
      this.flags.rs25 = true;
      exhaust.ignite('rs25', 1.6);
      exhaust.steamBurst();
      hud.callout('Main engine start');
    }
    if (T >= 0 && !this.flags.srb) {
      this.flags.srb = true;
      exhaust.ignite('srb', 0.25);
      hud.callout('Liftoff');
      hud.flash(0.35);
    }

    const ta = Math.max(0, T - L.holdDown);
    const k = (3 * L.ascentAltitude) / L.ascentDuration ** 3;
    const alt = (k * ta ** 3) / 3;
    this.speed = k * ta * ta;
    this.velocity.set(0, this.speed, 0);
    rocket.rig.position.set(pad.x, pad.y + alt, pad.z);
    const roll = (Math.PI / 2) * smoothstep(L.roll[0], L.roll[1], ta);
    rocket.attitude.quaternion.setFromAxisAngle(UP, roll);
    if (ta > L.roll[0] && !this.flags.roll) {
      this.flags.roll = true;
      hud.callout('Roll program');
    }

    exhaust.velocity.copy(this.velocity);
    exhaust.atmosphere = 1;
    exhaust.vacuum = smoothstep(CONFIG.sky.spaceFrom, CONFIG.sky.spaceTo, alt) * 0.6;

    const c = CONFIG.launch.liftoffCam;
    if (T < 0) {
      const e = easeInOutCubic(Math.min(1, this.t / L.countdown));
      const a = this.startAngle + this.sweep * e;
      const r = lerp(CONFIG.title.radius, c.radius, e);
      camRig.pos.set(pad.x + Math.cos(a) * r, lerp(CONFIG.title.height, c.height, e), pad.z + Math.sin(a) * r);
      camRig.look.set(pad.x, lerp(CONFIG.title.lookY, pad.y + 60, e), pad.z);
    } else {
      if (!this.flags.cam) {
        this.flags.cam = true;
        this.liftoffPos.copy(camRig.pos);
        this.hDir.set(camRig.pos.x - pad.x, 0, camRig.pos.z - pad.z).normalize();
      }
      const w = smoothstep(1.0, 4.4, ta);
      const chase = rocket.rig.position.clone()
        .addScaledVector(this.hDir, lerp(c.radius, 1700, w))
        .add(new THREE.Vector3(0, -320, 0));
      camRig.pos.lerpVectors(this.liftoffPos, chase, w);
      camRig.look.copy(rocket.rig.position).y += 60;
    }

    const srb = exhaust.throttle.srb;
    fx.shake = exhaust.throttle.rs25 * 0.12 + srb * (0.15 + 0.85 * (1 - smoothstep(0, 6, ta)));

    return ta >= L.ascentDuration;
  }
}
