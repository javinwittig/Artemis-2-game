import * as THREE from 'three';
import { CONFIG, QUALITY, rand } from './config.js';
import { randomDir } from './particles.js';

// --- small value noise for the rock shapes (CPU side) ---
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), sx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), sx), sy),
    l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), sx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), sx), sy),
    sz,
  );
}
function fbm3(x, y, z) {
  let s = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    s += a * noise3(x, y, z);
    x = x * 2.1 + 5.3; y = y * 2.1 + 1.7; z = z * 2.1 + 9.1;
    a *= 0.5;
  }
  return s / 0.9375;
}

// A lumpy, cratered rock: displaced icosphere with darker crater floors.
function makeRockGeometry(detail) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const seed = Math.random() * 100;
  const stretch = new THREE.Vector3(1, rand(0.7, 1.05), rand(0.65, 0.95));
  const craters = Array.from({ length: 7 }, () => ({
    c: randomDir(new THREE.Vector3()),
    r: rand(0.22, 0.5),
    d: rand(0.08, 0.18),
  }));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let h = 1 + (fbm3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7) - 0.5) * 0.6 + (noise3(v.x * 6 + seed, v.y * 6, v.z * 6) - 0.5) * 0.1;
    let shade = 1;
    for (const cr of craters) {
      const t = v.distanceTo(cr.c) / cr.r;
      if (t < 1) {
        h -= cr.d * (1 - t * t);
        shade -= 0.28 * (1 - t);
      } else if (t < 1.25) {
        h += cr.d * 0.35 * (1 - Math.abs(t - 1.1) / 0.15);
      }
    }
    v.multiplyScalar(h).multiply(stretch);
    pos.setXYZ(i, v.x, v.y, v.z);
    const g = (0.45 + fbm3(v.x * 3 + seed, v.y * 3, v.z * 3) * 0.35) * Math.max(0.45, shade);
    colors[i * 3] = g * 1.05;
    colors[i * 3 + 1] = g * 0.97;
    colors[i * 3 + 2] = g * 0.88;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals(); // non-indexed: faceted, rocky look
  geo.computeBoundingSphere();
  return geo;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _tmpColor = new THREE.Color();
const _v = new THREE.Vector3();

export class AsteroidField {
  constructor(ctx) {
    this.ctx = ctx;
    const A = CONFIG.asteroids;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.04, flatShading: true });
    this.variants = [];
    for (let i = 0; i < A.variants; i++) {
      const mesh = new THREE.InstancedMesh(makeRockGeometry(QUALITY.asteroidDetail), material, A.perVariant);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      ctx.scene.add(mesh);
      this.variants.push({ mesh, items: [] });
    }
    this.list = [];
  }

  /**
   * centre: lane centre (anchor), target: rocket position, dist: spawn distance ahead,
   * difficulty: 0..1
   */
  spawn(centre, target, dist, difficulty) {
    const A = CONFIG.asteroids;
    const free = this.variants.filter((v) => v.items.length < A.perVariant);
    if (!free.length) return;
    const variant = free[(Math.random() * free.length) | 0];
    const r = A.minR + (A.maxR - A.minR) * Math.pow(Math.random(), 1.7) * (0.7 + 0.3 * difficulty);
    const pos = new THREE.Vector3();
    if (Math.random() < A.aimed + 0.2 * difficulty) {
      pos.set(target.x + rand(-200, 200), target.y + rand(-150, 150), 0);
    } else {
      pos.set(centre.x + rand(-A.fieldX, A.fieldX), centre.y + rand(-A.fieldY, A.fieldY), 0);
    }
    pos.z = target.z - dist - rand(0, 1500);
    const a = {
      variant,
      slot: variant.items.length,
      pos,
      vel: new THREE.Vector3(rand(-50, 50), rand(-40, 40), rand(0, 320) * difficulty),
      quat: new THREE.Quaternion().setFromAxisAngle(randomDir(new THREE.Vector3()), rand(0, Math.PI * 2)),
      axis: randomDir(new THREE.Vector3()),
      spin: rand(0.15, 0.9) * Math.sqrt(80 / r),
      scale: new THREE.Vector3(r, r, r),
      r,
      hitR: r * 0.85,
    };
    variant.items.push(a);
    variant.mesh.setColorAt(a.slot, new THREE.Color().setHSL(rand(0.05, 0.1), rand(0.05, 0.22), rand(0.45, 0.62)));
    variant.mesh.instanceColor.needsUpdate = true;
    this.list.push(a);
  }

  remove(a) {
    const items = a.variant.items;
    const last = items.pop();
    if (last !== a) {
      items[a.slot] = last;
      last.slot = a.slot;
      a.variant.mesh.getColorAt(items.length, _tmpColor);
      a.variant.mesh.setColorAt(last.slot, _tmpColor);
      a.variant.mesh.instanceColor.needsUpdate = true;
    }
    const i = this.list.indexOf(a);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear() {
    for (const v of this.variants) {
      v.items.length = 0;
      v.mesh.count = 0;
    }
    this.list.length = 0;
  }

  // Moves everything and drops rocks that are behind the camera.
  update(dt, cameraZ) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.pos.addScaledVector(a.vel, dt);
      a.quat.premultiply(_q.setFromAxisAngle(a.axis, a.spin * dt));
      if (a.pos.z - a.r > cameraZ + 200) this.remove(a);
    }
    for (const v of this.variants) {
      for (const a of v.items) v.mesh.setMatrixAt(a.slot, _m.compose(a.pos, a.quat, a.scale));
      v.mesh.count = v.items.length;
      v.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Shield impact: the rock bursts into dust and glowing debris.
  shatter(a, rocketVel) {
    const { smoke, sparks, fire } = this.ctx.particles;
    const p = a.pos;
    for (let i = 0; i < 40; i++) {
      randomDir(_v);
      const sp = rand(200, 900);
      sparks.emit({
        x: p.x + _v.x * a.r * 0.5, y: p.y + _v.y * a.r * 0.5, z: p.z + _v.z * a.r * 0.5,
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp - rocketVel * 0.2,
        life: rand(0.5, 1.2), size: rand(8, 16), sizeEnd: 3,
        color: [3, 4.5, 5], colorEnd: [0.6, 1.2, 2], alpha: 1, drag: 0.8,
      });
    }
    for (let i = 0; i < 26; i++) {
      randomDir(_v);
      const sp = rand(60, 320);
      const g = rand(0.3, 0.45);
      smoke.emit({
        x: p.x + _v.x * a.r * 0.6, y: p.y + _v.y * a.r * 0.6, z: p.z + _v.z * a.r * 0.6,
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        life: rand(1.2, 2.2), size: a.r * 0.6, sizeEnd: a.r * rand(1.6, 2.4),
        color: [g * 1.1, g, g * 0.85], colorEnd: [g * 0.6, g * 0.55, g * 0.5], alpha: 0.7, drag: 1.4, spin: rand(-1, 1),
      });
    }
    for (let i = 0; i < 12; i++) {
      randomDir(_v);
      fire.emit({
        x: p.x, y: p.y, z: p.z, vx: _v.x * 300, vy: _v.y * 300, vz: _v.z * 300,
        life: rand(0.2, 0.4), size: a.r * 0.6, sizeEnd: a.r * 1.8,
        color: [2, 3.5, 4.5], colorEnd: [0.3, 0.6, 1], alpha: 0.8, drag: 2,
      });
    }
    this.remove(a);
  }
}
