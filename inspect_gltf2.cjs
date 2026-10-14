const fs = require('fs');
const path = require('path');

const buffer = fs.readFileSync(path.join(__dirname, 'assets', 'Nasa_Rakete_small.glb'));

// Parse GLB
const jsonLength = buffer.readUInt32LE(12);
const jsonData = buffer.subarray(20, 20 + jsonLength).toString();
const gltf = JSON.parse(jsonData);

// Read binary buffer
const binOffset = 20 + jsonLength + 8; // skip JSON chunk header (8 bytes) + JSON data
const binLength = buffer.readUInt32LE(20 + jsonLength);
const binBuffer = buffer.subarray(binOffset, binOffset + binLength);

// Accessor helper
function getAccessorData(accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const componentType = accessor.componentType; // 5126 = FLOAT
  const count = accessor.count;
  const type = accessor.type; // SCALAR, VEC2, VEC3, VEC4
  const numComponents = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : type === 'VEC3' ? 3 : 4;
  
  const data = new Float32Array(binBuffer.buffer, binBuffer.byteOffset + byteOffset, count * numComponents);
  return data;
}

console.log('=== DETAILED MESH INFO ===');
gltf.meshes.forEach((mesh, mi) => {
  console.log(`\nMesh ${mi}: ${mesh.name || '(unnamed)'}`);
  mesh.primitives.forEach((prim, pi) => {
    const posAccessor = gltf.accessors[prim.attributes.POSITION];
    const posData = getAccessorData(prim.attributes.POSITION);
    
    // Compute bounds
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < posData.length; i += 3) {
      minX = Math.min(minX, posData[i]);
      minY = Math.min(minY, posData[i+1]);
      minZ = Math.min(minZ, posData[i+2]);
      maxX = Math.max(maxX, posData[i]);
      maxY = Math.max(maxY, posData[i+1]);
      maxZ = Math.max(maxZ, posData[i+2]);
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

console.log('\n=== NODE TRANSFORMS ===');
gltf.nodes.forEach((node, ni) => {
  const translation = node.translation || [0,0,0];
  const rotation = node.rotation || [0,0,0,1];
  const scale = node.scale || [1,1,1];
  console.log(`Node ${ni} (${node.name || '(unnamed)'}): pos=[${translation.map(v=>v.toFixed(2)).join(', ')}] scale=[${scale.map(v=>v.toFixed(2)).join(', ')}] mesh=${node.mesh}`);
});

console.log('\n=== MATERIALS ===');
gltf.materials.forEach((mat, i) => {
  console.log(`Material ${i}: ${mat.name || '(unnamed)'} alphaMode=${mat.alphaMode} doubleSided=${mat.doubleSided}`);
  if (mat.pbrMetallicRoughness) {
    const pbr = mat.pbrMetallicRoughness;
    if (pbr.baseColorFactor) console.log(`  baseColorFactor: [${pbr.baseColorFactor.map(v=>v.toFixed(3)).join(', ')}]`);
    if (pbr.baseColorTexture) console.log(`  baseColorTexture: index=${pbr.baseColorTexture.index}`);
    if (pbr.metallicRoughnessTexture) console.log(`  metallicRoughnessTexture: index=${pbr.metallicRoughnessTexture.index}`);
  }
  if (mat.emissiveFactor) console.log(`  emissiveFactor: [${mat.emissiveFactor.map(v=>v.toFixed(3)).join(', ')}]`);
});

console.log('\n=== TEXTURES/IMAGES ===');
if (gltf.textures) {
  gltf.textures.forEach((tex, i) => {
    const img = gltf.images[tex.source];
    console.log(`Texture ${i}: source=${tex.source}, image=${img.name || img.uri || '(embedded)'}`);
  });
}
if (gltf.images) {
  gltf.images.forEach((img, i) => {
    console.log(`Image ${i}: ${img.name || '(unnamed)'} uri=${img.uri || '(embedded)'} mimeType=${img.mimeType} bufferView=${img.bufferView}`);
  });
}