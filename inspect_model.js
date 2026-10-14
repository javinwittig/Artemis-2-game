import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  'assets/Nasa_Rakete_small.glb',
  (gltf) => {
    const model = gltf.scene;
    console.log('=== MODEL HIERARCHY ===');
    model.traverse((child) => {
      const indent = '  '.repeat(child.getWorldPosition(new THREE.Vector3()).length() === 0 ? 0 : 1);
      let info = `${child.name} (${child.type})`;
      if (child.isMesh) {
        info += ` - geometry: ${child.geometry.type}, vertices: ${child.geometry.attributes.position?.count}, material: ${child.material?.name || child.material?.type}`;
      }
      console.log(info);
    });
    
    console.log('\n=== ANIMATIONS ===');
    if (gltf.animations && gltf.animations.length > 0) {
      gltf.animations.forEach((anim, i) => {
        console.log(`Animation ${i}: ${anim.name}, duration: ${anim.duration}s, tracks: ${anim.tracks.length}`);
      });
    } else {
      console.log('No animations');
    }
    
    console.log('\n=== SCENE GRAPH (detailed) ===');
    function printHierarchy(obj, depth = 0) {
      const indent = '  '.repeat(depth);
      let line = `${indent}${obj.name || '(unnamed)'} [${obj.type}]`;
      if (obj.isMesh) {
        line += ` | geom: ${obj.geometry.type} | verts: ${obj.geometry.attributes.position?.count} | mat: ${obj.material?.name || obj.material?.type}`;
        if (obj.geometry.boundingBox) {
          const size = new THREE.Vector3();
          obj.geometry.boundingBox.getSize(size);
          line += ` | size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        }
      } else if (obj.isGroup || obj.isObject3D) {
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        line += ` | bbox: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
      }
      console.log(line);
      obj.children.forEach(child => printHierarchy(child, depth + 1));
    }
    printHierarchy(model);
  },
  undefined,
  (err) => console.error('Error:', err)
);