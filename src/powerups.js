import * as THREE from 'three';
import { CONFIG, distToSegment, rand } from './config.js';
import { makeSpriteTexture, randomDir } from './particles.js';

const _v = new THREE.Vector3();

export class PowerUps {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x9ff6ff,
      emissive: new THREE.Color(0.25, 1.5, 1.9),
      metalness: 0.3,
      roughness: 0.15,
      flatShading: true,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 2.2, 2.8),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloMat = new THREE.SpriteMaterial({
      map: makeSpriteTexture('glow'),
      color: new THREE.Color(0.35, 1.5, 1.9),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const crystalGeo = new THREE.OctahedronGeometry(1, 0);
    const ringGeo = new THREE.TorusGeometry(95, 3.5, 8, 64);

    this.pool = Array.from({ length: 3 }, () => {
      const group = new THREE.Group();
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.scale.set(45, 72, 45);
      const ringA = new THREE.Mesh(ringGeo, ringMat);
      const ringB = new THREE.Mesh(ringGeo, ringMat);
      ringB.scale.setScalar(0.8);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(420);
      group.add(crystal, ringA, ringB, halo);
      group.visible = false;
      ctx.scene.add(group);
      return { group, crystal, ringA, ringB, halo, pos: new THREE.Vector3(), t: 0, active: false };
    });
  }

  spawn(centre, target, dist) {
    const item = this.pool.find((p) => !p.active);
    if (!item) return;
    const G = CONFIG.game;
    item.active = true;
    item.t = Math.random() * 10;
    item.pos.set(centre.x + rand(-0.85, 0.85) * G.boundsX, centre.y + rand(-0.85, 0.85) * G.boundsY, target.z - dist);
    item.group.position.copy(item.pos);
    item.group.visible = true;
    this.items.push(item);
  }

  update(dt, cameraZ) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.crystal.rotation.y += dt * 2.2;
      it.crystal.rotation.z = Math.sin(it.t * 1.3) * 0.3;
      it.ringA.rotation.set(it.t * 1.7, it.t * 0.9, 0);
      it.ringB.rotation.set(-it.t * 1.1, 0, it.t * 1.9);
      it.halo.material.rotation = it.t;
      it.group.position.set(it.pos.x, it.pos.y + Math.sin(it.t * 2) * 20, it.pos.z);
      const pulse = 1 + Math.sin(it.t * 6) * 0.12;
      it.halo.scale.setScalar(420 * pulse);
      if (it.pos.z > cameraZ + 200) this.release(i);
    }
  }

  collect(a, b) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (distToSegment(it.group.position, a, b) < CONFIG.powerups.collectRadius) {
        this.burst(it.group.position);
        this.release(i);
        return true;
      }
    }
    return false;
  }

  burst(p) {
    const { sparks, fire } = this.ctx.particles;
    for (let i = 0; i < 70; i++) {
      randomDir(_v);
      const sp = rand(300, 1100);
      sparks.emit({
        x: p.x, y: p.y, z: p.z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        life: rand(0.5, 1.1), size: rand(10, 20), sizeEnd: 3,
        color: [1.5, 4.5, 5.5], colorEnd: [0.4, 1.5, 2.5], alpha: 1, drag: 1.2,
      });
    }
    fire.emit({ x: p.x, y: p.y, z: p.z, life: 0.45, size: 120, sizeEnd: 700, color: [1.5, 4, 5], colorEnd: [0.2, 0.8, 1.2], alpha: 0.8 });
  }

  release(i) {
    const it = this.items[i];
    it.active = false;
    it.group.visible = false;
    this.items.splice(i, 1);
  }

  clear() {
    while (this.items.length) this.release(this.items.length - 1);
  }
}
