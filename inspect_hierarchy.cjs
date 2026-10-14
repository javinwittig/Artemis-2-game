const fs = require('fs');
const path = require('path');

// Parse GLB to get node names and structure
const buffer = fs.readFileSync(path.join(__dirname, 'assets', 'Nasa_Rakete_small.glb'));
const jsonLength = buffer.readUInt32LE(12);
const jsonData = buffer.subarray(20, 20 + jsonLength).toString();
const gltf = JSON.parse(jsonData);

console.log('=== NODE HIERARCHY WITH TRANSFORMS ===');
gltf.nodes.forEach((node, i) => {
  const translation = node.translation || [0,0,0];
  const rotation = node.rotation || [0,0,0,1];
  const scale = node.scale || [1,1,1];
  const children = node.children || [];
  console.log(`Node ${i}: ${node.name || '(unnamed)'}`);
  console.log(`  Translation: [${translation.map(v=>v.toFixed(2)).join(', ')}]`);
  console.log(`  Rotation: [${rotation.map(v=>v.toFixed(4)).join(', ')}]`);
  console.log(`  Scale: [${scale.map(v=>v.toFixed(2)).join(', ')}]`);
  console.log(`  Mesh: ${node.mesh !== undefined ? node.mesh : 'none'}`);
  console.log(`  Children: ${children.length > 0 ? children.join(', ') : 'none'}`);
  console.log('');
});

console.log('=== MESHES ===');
gltf.meshes.forEach((mesh, i) => {
  console.log(`Mesh ${i}: ${mesh.name || '(unnamed)'}`);
  mesh.primitives.forEach((prim, j) => {
    console.log(`  Prim ${j}: material=${prim.material !== undefined ? prim.material : 'none'}, attrs=${Object.keys(prim.attributes).join(', ')}`);
  });
});

console.log('=== MATERIALS ===');
gltf.materials.forEach((mat, i) => {
  console.log(`Material ${i}: ${mat.name || '(unnamed)'}`);
  if (mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) {
    console.log(`  baseColor: [${mat.pbrMetallicRoughness.baseColorFactor.map(v=>v.toFixed(3)).join(', ')}]`);
  }
  if (mat.emissiveFactor) {
    console.log(`  emissive: [${mat.emissiveFactor.map(v=>v.toFixed(3)).join(', ')}]`);
  }
});