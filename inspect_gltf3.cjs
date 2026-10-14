const fs = require('fs');
const path = require('path');

const buffer = fs.readFileSync(path.join(__dirname, 'assets', 'Nasa_Rakete_small.glb'));

// Parse GLB
const jsonLength = buffer.readUInt32LE(12);
const jsonData = buffer.subarray(20, 20 + jsonLength).toString();
const gltf = JSON.parse(jsonData);

// Read binary buffer
const binOffset = 20 + jsonLength + 8;
const binLength = buffer.readUInt32LE(20 + jsonLength);
const binBuffer = buffer.subarray(binOffset, binOffset + binLength);

function getAccessorData(accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const componentType = accessor.componentType;
  const count = accessor.count;
  const type = accessor.type;
  const numComponents = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
  const byteStride = bufferView.byteStride || 0;
  
  if (componentType !== 5126) { // FLOAT
    console.log(`  Warning: non-float component type ${componentType}`);
  }
  
  if (byteStride === 0 || byteStride === numComponents * 4) {
    // Tightly packed
    return new Float32Array(binBuffer.buffer, binBuffer.byteOffset + byteOffset, count * numComponents);
  } else {
    // Interleaved - need to de-interleave
    const result = new Float32Array(count * numComponents);
    const elementStride = byteStride / 4; // in floats
    const source = new Float32Array(binBuffer.buffer, binBuffer.byteOffset + byteOffset, count * elementStride);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < numComponents; c++) {
        result[i * numComponents + c] = source[i * elementStride + c];
      }
    }
    return result;
  }
}

console.log('=== DETAILED MESH INFO ===');
gltf.meshes.forEach((mesh, mi) => {
  console.log(`\nMesh ${mi}: ${mesh.name || '(unnamed)'}`);
  mesh.primitives.forEach((prim, pi) => {
    if (!prim.attributes.POSITION) {
      console.log(`  Prim ${pi}: NO POSITION ATTRIBUTE`);
      return;
    }
    const posAccessor = gltf.accessors[prim.attributes.POSITION];
    const posData = getAccessorData(prim.attributes.POSITION);
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < posData.length; i += 3) {
      const x = posData[i], y = posData[i+1], z = posData[i+2];
      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const centerY = (minY + maxY) / 2;
    
    console.log(`  Prim ${pi}: verts=${posAccessor.count}, tris=${posAccessor.count/3}`);
    console.log(`    Bounds: X[${minX.toFixed(2)},${maxX.toFixed(2)}] Y[${minY.toFixed(2)},${maxY.toFixed(2)}] Z[${minZ.toFixed(2)},${maxZ.toFixed(2)}]`);
    console.log(`    Size: ${sizeX.toFixed(2)} x ${sizeY.toFixed(2)} x ${sizeZ.toFixed(2)}`);
    console.log(`    Center Y: ${centerY.toFixed(2)}`);
    console.log(`    Material: ${prim.material !== undefined ? prim.material : 'none'}`);
  });
});

console.log('\n=== NODE WORLD TRANSFORMS (with mesh bounds) ===');
gltf.nodes.forEach((node, ni) => {
  const translation = node.translation || [0,0,0];
  const rotation = node.rotation || [0,0,0,1];
  const scale = node.scale || [1,1,1];
  
  if (node.mesh !== undefined) {
    const mesh = gltf.meshes[node.mesh];
    mesh.primitives.forEach((prim, pi) => {
      if (!prim.attributes.POSITION) return;
      const posAccessor = gltf.accessors[prim.attributes.POSITION];
      const posData = getAccessorData(prim.attributes.POSITION);
      
      let minY = Infinity, maxY = -Infinity;
      for (let i = 1; i < posData.length; i += 3) {
        const y = posData[i];
        if (isNaN(y)) continue;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      
      // Apply scale and translation
      const worldMinY = minY * scale[1] + translation[1];
      const worldMaxY = maxY * scale[1] + translation[1];
      const worldCenterY = (worldMinY + worldMaxY) / 2;
      const worldHeight = worldMaxY - worldMinY;
      
      console.log(`Node ${ni} (${node.name || '(unnamed)'}): mesh=${node.mesh} prim=${pi}`);
      console.log(`  Local Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}] height=${(maxY-minY).toFixed(2)}`);
      console.log(`  World Y: [${worldMinY.toFixed(2)}, ${worldMaxY.toFixed(2)}] height=${worldHeight.toFixed(2)} centerY=${worldCenterY.toFixed(2)}`);
      console.log(`  Transform: pos=[${translation.map(v=>v.toFixed(2)).join(', ')}] scale=[${scale.map(v=>v.toFixed(2)).join(', ')}]`);
    });
  }
});