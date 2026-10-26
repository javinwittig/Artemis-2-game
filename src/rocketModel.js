import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CONFIG } from './config.js';

// Works both with Vite (asset gets hashed into dist/) and with a plain static server.
const modelUrl = new URL('../assets/Nasa_Rakete_small.glb', import.meta.url).href;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function loadRocketModel(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => {
    loader.load(
      modelUrl,
      (gltf) => {
        try {
          resolve(new Rocket(gltf.scene));
        } catch (err) {
          reject(err);
        }
      },
      (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); },
      reject,
    );
  });
}

function requireMesh(root, name) {
  const mesh = root.getObjectByName(name);
  if (!mesh || !mesh.isMesh) throw new Error(`Mesh "${name}" not found in the model`);
  return mesh;
}

// Buckets the triangles of a mesh by a key derived from their world-space centroid.
function splitTriangles(mesh, classify) {
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const buckets = new Map();
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    _a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
    _b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
    _c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
    _a.add(_b).add(_c).divideScalar(3);
    const key = classify(_a);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(ia, ib, ic);
  }
  return buckets;
}

// A geometry that shares all vertex data with `geo` but draws only `indices`.
// (The export uses quantized attributes, so the vertices are left untouched.)
function subGeometry(geo, indices) {
  const g = new THREE.BufferGeometry();
  for (const name in geo.attributes) g.setAttribute(name, geo.attributes[name]);
  g.setIndex(indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function worldBoxOfIndices(mesh, indices) {
  const pos = mesh.geometry.attributes.position;
  const box = new THREE.Box3();
  for (const i of indices) box.expandByPoint(_a.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  return box;
}

/**
 * Splits the launch-site scene from the GLB into:
 *  - the launch site (pad, towers, terrain) that stays on the ground
 *  - a rocket rig: core stage + Orion and two separable boosters, each with its nozzles
 */
export class Rocket {
  constructor(root) {
    root.updateMatrixWorld(true);
    const cfg = CONFIG.model;
    const core = requireMesh(root, cfg.core);
    const boosters = requireMesh(root, cfg.boosters);
    const host = requireMesh(root, cfg.nozzleHost);

    const coreBox = new THREE.Box3().setFromObject(core, true);
    const footprint = new THREE.Box3().setFromObject(boosters, true).union(coreBox).expandByScalar(6);
    const cx = (coreBox.min.x + coreBox.max.x) / 2;
    const cz = (coreBox.min.z + coreBox.max.z) / 2;

    // 1) The nozzles are modelled as part of the launch tower: cut out every triangle
    //    inside the rocket's footprint just below the stages.
    const hostParts = splitTriangles(host, (p) => {
      const inside = p.x > footprint.min.x && p.x < footprint.max.x && p.z > footprint.min.z && p.z < footprint.max.z
        && p.y > coreBox.min.y - 30 && p.y < coreBox.min.y + 20;
      if (!inside) return 'pad';
      if (p.z < cz - 15) return 'A';
      if (p.z > cz + 15) return 'B';
      return (p.x < cx ? 'c0' : 'c1') + (p.z < cz ? '0' : '1');
    });
    const nozzleKeys = ['A', 'B', 'c00', 'c01', 'c10', 'c11'];
    for (const k of nozzleKeys) {
      if (!hostParts.has(k)) throw new Error(`Nozzle "${k}" not found in the model`);
    }

    const nozzleBoxes = {};
    const nozzleBox = new THREE.Box3();
    for (const k of nozzleKeys) {
      nozzleBoxes[k] = worldBoxOfIndices(host, hostParts.get(k));
      nozzleBox.union(nozzleBoxes[k]);
    }

    // 2) Lower the stack onto the launcher deck and pivot it around its middle.
    const dy = cfg.deckY - nozzleBox.min.y;
    this.length = coreBox.max.y - nozzleBox.min.y;
    this.radius = (coreBox.max.x - coreBox.min.x) / 2;
    this.padPivot = new THREE.Vector3(cx, (nozzleBox.min.y + coreBox.max.y) / 2 + dy, cz);
    const toRig = new THREE.Matrix4().makeTranslation(-cx, dy - this.padPivot.y, -cz);

    this.rig = new THREE.Group();
    this.rig.name = 'rocketRig';
    this.attitude = new THREE.Group();
    this.rig.add(this.attitude);

    const place = (mesh, parent, worldMatrix) => {
      new THREE.Matrix4().multiplyMatrices(toRig, worldMatrix).decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    };

    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, metalness: 0.85, roughness: 0.38 });
    const hostMatrix = host.matrixWorld.clone();
    const nozzleMesh = (keys) => {
      const idx = keys.flatMap((k) => hostParts.get(k));
      return new THREE.Mesh(subGeometry(host.geometry, idx), nozzleMat);
    };

    this.core = new THREE.Group();
    this.core.name = 'coreStage';
    this.attitude.add(this.core);
    place(core, this.core, core.matrixWorld.clone());
    place(nozzleMesh(['c00', 'c01', 'c10', 'c11']), this.core, hostMatrix);

    // 3) Both boosters are one mesh: split them by side so they can separate.
    const boosterParts = splitTriangles(boosters, (p) => (p.z < cz ? 'A' : 'B'));
    const boosterMatrix = boosters.matrixWorld.clone();
    this.boosters = ['A', 'B'].map((side) => {
      const group = new THREE.Group();
      group.name = `booster${side}`;
      this.attitude.add(group);
      place(new THREE.Mesh(subGeometry(boosters.geometry, boosterParts.get(side)), boosters.material), group, boosterMatrix);
      place(nozzleMesh([side]), group, hostMatrix);
      // move the group origin to the booster's own centre so it tumbles naturally
      const centre = new THREE.Box3().setFromObject(group, true).getCenter(new THREE.Vector3());
      group.position.copy(centre);
      for (const child of group.children) child.position.sub(centre);
      return group;
    });
    this.boosterHome = this.boosters.map((b) => ({ position: b.position.clone(), quaternion: b.quaternion.clone() }));
    boosters.removeFromParent();

    // 4) Nozzle exits (centre of the exit plane) in the space of their parent group.
    this.nozzles = nozzleKeys.map((k) => {
      const box = nozzleBoxes[k];
      const exit = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
        .applyMatrix4(toRig);
      const isBooster = k === 'A' || k === 'B';
      const group = isBooster ? this.boosters[k === 'A' ? 0 : 1] : this.core;
      if (isBooster) exit.sub(group.position);
      return {
        group,
        local: exit,
        radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
        kind: isBooster ? 'srb' : 'rs25',
      };
    });

    // 5) Everything left over is the launch site.
    host.geometry = subGeometry(host.geometry, hostParts.get('pad'));
    const padMetal = new THREE.MeshStandardMaterial({ color: 0xd4d8dd, metalness: 0.35, roughness: 0.55 });
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.material || (!o.material.map && o.material.name === '')) o.material = padMetal;
      o.receiveShadow = true;
      // the flat ground pieces never need to cast shadows
      o.castShadow = !/^(Plane|Cube011)/.test(o.name);
    });
    this.pad = root;
    this.pad.name = 'launchSite';

    this.debris = [];
    this.reset();
  }

  get altitude() {
    return this.rig.position.y - this.padPivot.y;
  }

  reset() {
    this.rig.position.copy(this.padPivot);
    this.rig.visible = true;
    this.attitude.quaternion.identity();
    this.boosters.forEach((b, i) => {
      this.attitude.add(b);
      b.position.copy(this.boosterHome[i].position);
      b.quaternion.copy(this.boosterHome[i].quaternion);
      b.visible = true;
    });
    this.debris.length = 0;
    this.separated = false;
  }

  // Boosters keep their world transform and tumble away from the core.
  separateBoosters(velocity, scene) {
    if (this.separated) return;
    this.separated = true;
    this.rig.updateMatrixWorld(true);
    for (const b of this.boosters) {
      scene.attach(b);
      const outward = b.position.clone().sub(this.rig.position);
      const axis = _a.set(0, 1, 0).applyQuaternion(this.attitude.quaternion);
      outward.addScaledVector(axis, -outward.dot(axis)).normalize();
      this.debris.push({
        obj: b,
        t: 0,
        vel: velocity.clone().multiplyScalar(0.6).addScaledVector(outward, 260).add(_b.set(0, -260, 0)),
        spinAxis: new THREE.Vector3().crossVectors(axis, outward).normalize(),
        spin: (Math.random() * 0.6 + 0.5) * (Math.random() < 0.5 ? -1 : 1),
      });
    }
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      if (!d.obj.visible) continue;
      d.t += dt;
      d.vel.multiplyScalar(Math.max(0, 1 - 0.25 * dt));
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.quaternion.premultiply(_q.setFromAxisAngle(d.spinAxis, d.spin * dt));
      if (d.t > 6) d.obj.visible = false;
    }
  }
}
