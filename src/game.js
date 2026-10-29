import * as THREE from 'three';
import { CONFIG, clamp01, distToSegment, lerp, rand } from './config.js';
import { AsteroidField } from './asteroids.js';
import { PowerUps } from './powerups.js';
import { flightAttitude } from './transition.js';
import { randomDir } from './particles.js';

const SHIELD_VERT = `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SHIELD_FRAG = `
uniform float uTime;
uniform float uAlpha;
uniform float uHit;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float bands = 0.5 + 0.5 * sin(vP.y * 18.0 - uTime * 7.0);
  float cells = smoothstep(0.85, 1.0, abs(sin(atan(vP.z, vP.x) * 9.0)) * abs(sin(vP.y * 14.0)));
  float pulse = 0.8 + 0.2 * sin(uTime * 9.0);
  vec3 col = vec3(0.3, 0.8, 1.0) * (0.05 + fres * 1.8 + (bands * 0.4 + cells * 0.6) * fres) * pulse;
  col += vec3(0.8, 0.95, 1.0) * uHit * (0.25 + fres);
  gl_FragColor = vec4(col * uAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

function loadBest() {
  try {
    return parseInt(localStorage.getItem(CONFIG.storage.best) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(km) {
  try {
    localStorage.setItem(CONFIG.storage.best, String(km));
  } catch {}
}

export class Game {
  constructor(ctx, { onGameOver }) {
    this.ctx = ctx;
    this.onGameOver = onGameOver;
    this.asteroids = new AsteroidField(ctx);
    this.powerups = new PowerUps(ctx);
    this.anchor = new THREE.Vector3();
    this.segA = new THREE.Vector3();
    this.segB = new THREE.Vector3();
    this.baseQuat = flightAttitude(Math.PI / 2, new THREE.Quaternion());
    this.velocity = new THREE.Vector3();
    this.state = 'idle';
    this.best = loadBest();
    this.flown = 0;

    this.shieldUniforms = { uTime: ctx.timeUniform, uAlpha: { value: 0 }, uHit: { value: 0 } };
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: this.shieldUniforms,
        vertexShader: SHIELD_VERT,
        fragmentShader: SHIELD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.shieldR = 105;
    this.shieldL = ctx.rocket.length * 0.62;
    this.shield.scale.set(this.shieldR, this.shieldL, this.shieldR);
    this.shield.renderOrder = 5;
    this.shield.visible = false;
    ctx.rocket.attitude.add(this.shield);

    this.flashLight = new THREE.PointLight(0xffb070, 0, 8000, 1);
    ctx.scene.add(this.flashLight);
  }

  get km() {
    return Math.floor(this.scoreD * CONFIG.game.kmPerUnit);
  }

  begin(anchor) {
    this.anchor.copy(anchor);
    this.reset();
    this.respawnT = 0;
  }

  retry() {
    this.anchor.z -= this.d;
    this.reset();
    this.respawnT = CONFIG.game.respawnTime;
    this.ctx.exhaust.ignite('rs25', 0.4);
  }

  reset() {
    const G = CONFIG.game;
    this.d = 0;
    this.scoreD = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.elapsed = 0;
    this.speed = G.speedStart;
    this.shieldT = 0;
    this.grace = G.graceTime;
    this.spawnT = 0.2;
    this.powerT = CONFIG.powerups.first;
    this.deathT = 0;
    this.record = false;
    this.warnTick = 0;
    this.asteroids.clear();
    this.powerups.clear();
    this.shield.visible = false;
    this.shieldUniforms.uHit.value = 0;
    this.flashLight.intensity = 0;
    this.ctx.rocket.rig.visible = true;
    this.ctx.hud.setShield(0, 1, false);
    this.state = 'playing';
  }

  stop() {
    this.state = 'idle';
    this.asteroids.clear();
    this.powerups.clear();
    this.shield.visible = false;
    this.flashLight.intensity = 0;
    this.flown = 0;
    this.ctx.hud.setShield(0, 1, false);
  }

  update(dt) {
    if (this.state === 'idle') return;
    const G = CONFIG.game;
    const { rocket, camRig, exhaust, hud, fx } = this.ctx;

    if (this.state === 'playing') {
      this.elapsed += dt;
      this.grace = Math.max(0, this.grace - dt);
      this.speed = lerp(G.speedStart, G.speedMax, clamp01(this.elapsed / G.speedRamp));
      this.scoreD += this.speed * dt;
      this.steer(dt);
    } else {
      this.deathT += dt;
      this.speed *= Math.exp(-1.6 * dt);
      this.flashLight.intensity *= Math.exp(-5 * dt);
    }
    this.d += this.speed * dt;
    this.flown += this.speed * dt;

    let fly = 0;
    if (this.respawnT > 0) {
      this.respawnT = Math.max(0, this.respawnT - dt);
      const r = this.respawnT / G.respawnTime;
      fly = r * r * r * 1800;
    }
    rocket.rig.position.set(this.anchor.x + this.x, this.anchor.y + this.y, this.anchor.z - this.d + fly);
    const s = G.steerSpeed;
    rocket.attitude.quaternion
      .copy(_q1.setFromAxisAngle(Y, (-this.vx / s) * 0.22))
      .multiply(_q2.setFromAxisAngle(X, (this.vy / s) * 0.18))
      .multiply(_q3.setFromAxisAngle(Z, (-this.vx / s) * 0.55))
      .multiply(this.baseQuat);

    const f = G.camFollow;
    camRig.pos.set(this.anchor.x + this.x * f, this.anchor.y + this.y * f + G.camUp, this.anchor.z - this.d + G.camBack);
    camRig.look.set(this.anchor.x + this.x * 0.9, this.anchor.y + this.y * 0.9, this.anchor.z - this.d - G.lookAhead);
    fx.shake = this.state === 'playing' ? 0.03 : 0;

    this.velocity.set(this.vx, this.vy, -this.speed);
    exhaust.velocity.copy(this.velocity);
    exhaust.vacuum = 1;
    exhaust.atmosphere = 0;

    const camZ = camRig.pos.z;
    this.asteroids.update(dt, camZ);
    this.powerups.update(dt, camZ);

    if (this.state === 'playing') {
      this.spawn(dt);
      this.updateShield(dt);
      this.collide();
      hud.setStats(this.km, this.speed * G.kmPerUnit, Math.max(this.best, this.km));
    } else if (this.state === 'dying' && this.deathT > G.deathDelay) {
      this.state = 'over';
      this.onGameOver(this.km, this.best, this.record);
    }
  }

  steer(dt) {
    const G = CONFIG.game;
    const { input } = this.ctx;
    const k = 1 - Math.exp(-G.steerResponse * dt);
    this.vx += (input.x * G.steerSpeed - this.vx) * k;
    this.vy += (input.y * G.steerSpeed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (Math.abs(this.x) > G.boundsX) {
      this.x = Math.sign(this.x) * G.boundsX;
      this.vx = 0;
    }
    if (Math.abs(this.y) > G.boundsY) {
      this.y = Math.sign(this.y) * G.boundsY;
      this.vy = 0;
    }
  }

  spawn(dt) {
    const A = CONFIG.asteroids;
    const P = CONFIG.powerups;
    const rocketPos = this.ctx.rocket.rig.position;
    const difficulty = clamp01(this.elapsed / A.rateRamp);
    const rate = lerp(A.rateStart, A.rateMax, difficulty);
    this.spawnT -= dt;
    while (this.spawnT <= 0) {
      this.spawnT += rand(0.6, 1.4) / rate;
      this.asteroids.spawn(this.anchor, rocketPos, CONFIG.game.spawnAhead, difficulty);
    }
    this.powerT -= dt;
    if (this.powerT <= 0) {
      this.powerT = rand(P.intervalMin, P.intervalMax);
      this.powerups.spawn(this.anchor, rocketPos, CONFIG.game.spawnAhead * 0.85);
    }
  }

  activateShield() {
    const { sound, hud } = this.ctx;
    this.shieldT = CONFIG.powerups.shieldTime;
    sound.powerup();
    hud.callout('Shield active', 1.4);
    hud.flash(0.15);
  }

  updateShield(dt) {
    const P = CONFIG.powerups;
    const { hud, sound } = this.ctx;
    const u = this.shieldUniforms;
    u.uHit.value *= Math.exp(-6 * dt);
    if (this.shieldT <= 0) {
      this.shield.visible = false;
      return;
    }
    this.shieldT = Math.max(0, this.shieldT - dt);
    const warn = this.shieldT < P.warnTime;
    const fadeIn = clamp01((P.shieldTime - this.shieldT) / 0.25);
    const blink = warn ? (Math.sin(this.shieldT * Math.PI * 12) > 0 ? 1 : 0.12) : 1;
    u.uAlpha.value = fadeIn * blink;
    this.shield.visible = this.shieldT > 0;
    if (warn) {
      this.warnTick -= dt;
      if (this.warnTick <= 0) {
        this.warnTick = 0.25;
        sound.warn();
      }
    } else {
      this.warnTick = 0;
    }
    hud.setShield(this.shieldT, P.shieldTime, warn);
  }

  collide() {
    const { rocket, sound, fx, hud } = this.ctx;
    const pos = rocket.rig.position;
    const half = rocket.length / 2;
    _axis.set(0, 1, 0).applyQuaternion(rocket.attitude.quaternion);
    this.segA.copy(pos).addScaledVector(_axis, half * 0.92);
    this.segB.copy(pos).addScaledVector(_axis, -half * 0.9);

    if (this.powerups.collect(this.segA, this.segB)) this.activateShield();

    const shielded = this.shieldT > 0;
    const capsuleR = rocket.radius * 0.95;
    _inv.copy(rocket.attitude.quaternion).invert();
    const list = this.asteroids.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (Math.abs(a.pos.z - pos.z) > this.shieldL + a.r + 50) continue;
      if (shielded) {
        _v.copy(a.pos).sub(pos).applyQuaternion(_inv);
        const sr = this.shieldR + a.hitR;
        const sl = this.shieldL + a.hitR;
        if ((_v.x / sr) ** 2 + (_v.y / sl) ** 2 + (_v.z / sr) ** 2 < 1) {
          this.asteroids.shatter(a, this.speed);
          this.shieldUniforms.uHit.value = 1;
          fx.impulse = Math.max(fx.impulse, 0.6);
          hud.flash(0.08);
          sound.asteroidHit();
        }
      } else if (this.grace <= 0 && this.respawnT <= 0 && distToSegment(a.pos, this.segA, this.segB) < capsuleR + a.hitR) {
        this.die();
        return;
      }
    }
  }

  die() {
    const { rocket, exhaust, hud, sound, fx } = this.ctx;
    this.state = 'dying';
    this.deathT = 0;
    const km = this.km;
    if (km > this.best) {
      this.best = km;
      this.record = true;
      saveBest(km);
    }
    this.explode(rocket.rig.position.clone());
    rocket.rig.visible = false;
    exhaust.cutoff('rs25', 0.05);
    this.shield.visible = false;
    this.shieldT = 0;
    hud.setShield(0, 1, false);
    fx.impulse = 2.4;
    hud.flash(0.55);
    sound.explosion();
  }

  explode(p) {
    const { fire, smoke, sparks } = this.ctx.particles;
    const fwd = -this.speed;
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 20000;
    for (let i = 0; i < 150; i++) {
      randomDir(_v);
      const sp = rand(150, 900);
      fire.emit({
        x: p.x + _v.x * 30, y: p.y + _v.y * 30, z: p.z + _v.z * 30 + rand(-150, 150),
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp + fwd,
        life: rand(0.5, 1.3), size: rand(30, 60), sizeEnd: rand(130, 240),
        color: [3.2, 1.8, 0.7], colorEnd: [0.9, 0.18, 0.03], alpha: 0.75, drag: 1.6, fadeIn: 0.02, spin: rand(-2, 2),
      });
    }
    for (let i = 0; i < 90; i++) {
      randomDir(_v);
      const sp = rand(60, 350);
      const g = rand(0.12, 0.22);
      smoke.emit({
        x: p.x + _v.x * 40, y: p.y + _v.y * 40, z: p.z + _v.z * 40 + rand(-150, 150),
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp + fwd,
        life: rand(2.5, 4), size: rand(80, 140), sizeEnd: rand(380, 520),
        color: [0.5, 0.3, 0.15], colorEnd: [g, g, g], alpha: 0.65, drag: 1.6, spin: rand(-0.6, 0.6), fadeIn: 0.05,
      });
    }
    for (let i = 0; i < 260; i++) {
      randomDir(_v);
      const sp = rand(500, 2200);
      sparks.emit({
        x: p.x, y: p.y, z: p.z + rand(-150, 150),
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp + fwd,
        life: rand(0.8, 2.2), size: rand(8, 16), sizeEnd: 2,
        color: [6, 4, 2], colorEnd: [2, 0.5, 0.1], alpha: 1, drag: 0.9,
      });
    }
  }
}
