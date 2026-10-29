import * as THREE from 'three';
import { CONFIG, lerp, rand } from './config.js';
import { NOISE_GLSL } from './environment.js';

const PLUME_VERT = `
uniform float uExpand;
varying float vAlong;
varying float vAng;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position;
  float along = clamp(-p.y, 0.0, 1.0);
  p.xz *= mix(1.0, uExpand, pow(along, 0.6));
  vAlong = along;
  vAng = atan(position.z, position.x);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const PLUME_FRAG = `
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uIntensity;
uniform float uDiamonds;
uniform float uTime;
varying float vAlong;
varying float vAng;
varying vec3 vN;
varying vec3 vV;
${NOISE_GLSL}
void main() {
  float a = vAlong;
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float fall = pow(1.0 - a, 1.7) * smoothstep(0.0, 0.03, a);
  float flick = 0.7 + 0.3 * vnoise(vec3(a * 9.0 - uTime * 30.0, vAng * 2.0, uTime * 6.0));
  float diamonds = mix(1.0, 0.55 + 0.9 * pow(0.5 + 0.5 * cos(a * 46.0), 6.0), uDiamonds * (1.0 - a));
  vec3 col = mix(uColA, uColB, smoothstep(0.0, 0.75, a));
  gl_FragColor = vec4(col * uIntensity * edge * fall * flick * diamonds, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const KINDS = {
  srb: {
    length: 560, lengthVac: 1.0, inner: 0.5,
    outer: [[6, 4.4, 2.4], [2.4, 0.7, 0.15]],
    core: [[10, 8.5, 6], [4.5, 2.4, 0.8]],
    expandAir: 1.7, expandVac: 2.4, diamonds: 0, intensity: 1.0,
  },
  rs25: {
    length: 170, lengthVac: 2.2, inner: 0.45,
    outer: [[2.6, 2.5, 3.4], [1.8, 0.65, 0.3]],
    core: [[7, 7, 8.5], [3.2, 2, 1.2]],
    expandAir: 1.15, expandVac: 3.6, diamonds: 1, intensity: 0.85,
  },
};

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Exhaust {
  constructor(ctx) {
    this.ctx = ctx;
    this.time = 0;
    this.throttle = { rs25: 0, srb: 0 };
    this.target = { rs25: 0, srb: 0 };
    this.rate = { rs25: 1, srb: 1 };
    this.vacuum = 0;
    this.atmosphere = 1;
    this.velocity = new THREE.Vector3();
    this.acc = { fire: 0, trail: 0, pad: 0 };

    const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 14, true);
    geo.translate(0, -0.5, 0);

    this.uniforms = {};
    const mats = {};
    for (const kind of Object.keys(KINDS)) {
      const K = KINDS[kind];
      this.uniforms[kind] = { uExpand: { value: K.expandAir }, uIntensity: { value: 0 }, uDiamonds: { value: K.diamonds } };
      mats[kind] = ['outer', 'core'].map((layer) => new THREE.ShaderMaterial({
        uniforms: {
          ...this.uniforms[kind],
          uColA: { value: new THREE.Vector3(...K[layer][0]) },
          uColB: { value: new THREE.Vector3(...K[layer][1]) },
          uTime: ctx.timeUniform,
        },
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }));
    }

    this.plumes = ctx.rocket.nozzles.map((n) => {
      const holder = new THREE.Group();
      holder.position.copy(n.local);
      const outer = new THREE.Mesh(geo, mats[n.kind][0]);
      const inner = new THREE.Mesh(geo, mats[n.kind][1]);
      for (const m of [outer, inner]) {
        m.frustumCulled = false;
        m.renderOrder = 4;
        holder.add(m);
      }
      holder.visible = false;
      n.group.add(holder);
      return { n, holder, outer, inner };
    });

    this.light = new THREE.PointLight(0xffa35a, 0, 4000, 1);
    this.light.position.set(0, -ctx.rocket.length / 2 - 60, 0);
    ctx.rocket.attitude.add(this.light);
  }

  ignite(kind, rampTime) {
    this.target[kind] = 1;
    this.rate[kind] = 1 / rampTime;
  }

  cutoff(kind, time) {
    this.target[kind] = 0;
    this.rate[kind] = 1 / time;
  }

  reset() {
    for (const k of ['rs25', 'srb']) {
      this.throttle[k] = 0;
      this.target[k] = 0;
    }
    for (const p of this.plumes) p.holder.visible = false;
    this.light.intensity = 0;
    this.vacuum = 0;
    this.atmosphere = 1;
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    this.time += dt;
    for (const k of ['rs25', 'srb']) {
      const d = this.target[k] - this.throttle[k];
      this.throttle[k] += Math.sign(d) * Math.min(Math.abs(d), this.rate[k] * dt);
    }
    const vac = this.vacuum;
    for (const kind of Object.keys(KINDS)) {
      const K = KINDS[kind];
      const u = this.uniforms[kind];
      u.uExpand.value = lerp(K.expandAir, K.expandVac, vac);
      u.uIntensity.value = K.intensity * Math.min(1, this.throttle[kind] * 1.4) * lerp(1, 0.7, vac);
      u.uDiamonds.value = K.diamonds * (1 - vac);
    }

    for (const p of this.plumes) {
      const K = KINDS[p.n.kind];
      const th = this.throttle[p.n.kind];
      p.holder.visible = th > 0.01 && p.n.group.visible;
      if (!p.holder.visible) continue;
      const flick = 1 + (Math.random() - 0.5) * 0.1;
      const len = K.length * lerp(1, K.lengthVac, vac) * (0.3 + 0.7 * th) * flick;
      const r = p.n.radius * 0.95;
      p.outer.scale.set(r, len, r);
      p.inner.scale.set(r * 0.62, len * K.inner, r * 0.62);
    }

    const glow = this.throttle.srb + this.throttle.rs25 * 0.4;
    this.light.intensity = glow * (1500 + Math.random() * 250) * lerp(1, 0.35, vac);

    this.emit(dt);
  }

  emit(dt) {
    const { fire, smoke } = this.ctx.particles;
    const rocket = this.ctx.rocket;
    rocket.rig.updateMatrixWorld(true);
    const atm = this.atmosphere;
    const v = this.velocity;

    for (const p of this.plumes) {
      if (!p.holder.visible) continue;
      const th = this.throttle[p.n.kind];
      const srb = p.n.kind === 'srb';
      p.holder.getWorldPosition(_p);
      _d.copy(DOWN).applyQuaternion(p.holder.getWorldQuaternion(_q));
      const r = p.n.radius;

      let n = (srb ? 70 : 30) * th * dt + Math.random();
      while (n-- >= 1) {
        const off = rand(0, srb ? 120 : 50);
        const sp = rand(500, 900);
        fire.emit({
          x: _p.x + _d.x * off + rand(-r, r) * 0.5, y: _p.y + _d.y * off + rand(-r, r) * 0.5, z: _p.z + _d.z * off + rand(-r, r) * 0.5,
          vx: v.x * 0.6 + _d.x * sp + rand(-50, 50), vy: v.y * 0.6 + _d.y * sp + rand(-50, 50), vz: v.z * 0.6 + _d.z * sp + rand(-50, 50),
          life: rand(0.18, 0.4), size: r * rand(1.4, 2.2), sizeEnd: r * rand(3.5, 5),
          color: srb ? [3.2, 2.2, 1.1] : [2.2, 2.0, 2.6], colorEnd: [1.4, 0.32, 0.06],
          alpha: 0.7, drag: 1.5, fadeIn: 0.05,
        });
      }

      if (atm > 0.02) {
        let m = (srb ? 26 : 5) * th * atm * dt + Math.random();
        while (m-- >= 1) {
          const off = rand(srb ? 90 : 40, srb ? 260 : 120);
          const g = rand(0.72, 0.86);
          smoke.emit({
            x: _p.x + _d.x * off + rand(-15, 15), y: _p.y + _d.y * off + rand(-15, 15), z: _p.z + _d.z * off + rand(-15, 15),
            vx: _d.x * rand(80, 200) + rand(-40, 40), vy: _d.y * rand(80, 200) + rand(-30, 30), vz: _d.z * rand(80, 200) + rand(-40, 40),
            life: rand(7, 11), size: rand(40, 70), sizeEnd: rand(230, 330),
            color: [1.0, 0.82, 0.6], colorEnd: [g, g, g * 1.02],
            alpha: 0.5 * atm, drag: 0.6, gravity: 4, spin: rand(-0.3, 0.3), fadeIn: 0.03,
          });
        }
      }
    }

    const alt = rocket.altitude;
    const padPower = Math.max(this.throttle.srb, this.throttle.rs25 * 0.45) * Math.max(0, 1 - alt / 400);
    if (padPower > 0.02) {
      let k = 60 * padPower * dt + Math.random();
      while (k-- >= 1) this.emitPadCloud(this.throttle.srb > 0.1);
    }
  }

  emitPadCloud(hot) {
    const { smoke, fire } = this.ctx.particles;
    const pad = this.ctx.rocket.padPivot;
    const side = Math.random() < 0.5 ? 1 : -1;
    const ang = (side > 0 ? 0 : Math.PI) + rand(-0.55, 0.55);
    const sp = rand(220, 560);
    const y = CONFIG.model.deckY - 45;
    const g = rand(0.78, 0.9);
    smoke.emit({
      x: pad.x + Math.cos(ang) * 120, y: y + rand(-10, 20), z: pad.z + Math.sin(ang) * 120,
      vx: Math.cos(ang) * sp, vy: rand(15, 90), vz: Math.sin(ang) * sp,
      life: rand(6, 10), size: rand(70, 110), sizeEnd: rand(300, 450),
      color: hot ? [1.25, 0.9, 0.62] : [0.95, 0.95, 0.95], colorEnd: [g, g, g],
      alpha: 0.6, drag: 0.85, gravity: 7, spin: rand(-0.25, 0.25), fadeIn: 0.04,
    });
    if (hot && Math.random() < 0.5) {
      fire.emit({
        x: pad.x + Math.cos(ang) * 80, y: y + 20, z: pad.z + Math.sin(ang) * 80,
        vx: Math.cos(ang) * sp * 1.4, vy: rand(0, 40), vz: Math.sin(ang) * sp * 1.4,
        life: rand(0.3, 0.6), size: 40, sizeEnd: 140,
        color: [3, 1.8, 0.8], colorEnd: [1.2, 0.3, 0.05], alpha: 0.7, drag: 1.2,
      });
    }
  }

  steamBurst() {
    const { smoke } = this.ctx.particles;
    const pad = this.ctx.rocket.padPivot;
    for (let i = 0; i < 70; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(60, 220);
      smoke.emit({
        x: pad.x + Math.cos(ang) * 40, y: CONFIG.model.deckY - rand(10, 50), z: pad.z + Math.sin(ang) * 40,
        vx: Math.cos(ang) * sp, vy: rand(10, 60), vz: Math.sin(ang) * sp,
        life: rand(4, 7), size: rand(40, 70), sizeEnd: rand(180, 260),
        color: [1, 1, 1], colorEnd: [0.9, 0.92, 0.95], alpha: 0.5, drag: 0.9, gravity: 8, fadeIn: 0.05,
      });
    }
  }

  separationPuffs() {
    const { smoke, fire } = this.ctx.particles;
    for (const b of this.ctx.rocket.boosters) {
      b.getWorldPosition(_p);
      for (let i = 0; i < 26; i++) {
        const along = rand(-180, 180);
        _d.set(0, 1, 0).applyQuaternion(b.quaternion);
        const x = _p.x + _d.x * along;
        const y = _p.y + _d.y * along;
        const z = _p.z + _d.z * along;
        smoke.emit({
          x, y, z, vx: rand(-120, 120) + this.velocity.x * 0.5, vy: rand(-120, 120) + this.velocity.y * 0.5, vz: rand(-120, 120) + this.velocity.z * 0.5,
          life: rand(1.5, 2.5), size: 40, sizeEnd: 160, color: [0.9, 0.9, 0.92], colorEnd: [0.6, 0.6, 0.65],
          alpha: 0.35 * this.atmosphere + 0.15, drag: 1.2,
        });
        if (i % 3 === 0) {
          fire.emit({
            x, y, z, vx: rand(-200, 200) + this.velocity.x * 0.5, vy: rand(-200, 200) + this.velocity.y * 0.5, vz: rand(-200, 200) + this.velocity.z * 0.5,
            life: rand(0.25, 0.5), size: 30, sizeEnd: 90, color: [4, 2.6, 1.2], colorEnd: [1, 0.25, 0.05], alpha: 0.8, drag: 1.5,
          });
        }
      }
    }
  }
}
