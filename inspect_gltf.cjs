const fs = require('fs');
const path = require('path');

// Simple GLTF parser to extract hierarchy
const buffer = fs.readFileSync(path.join(__dirname, 'assets', 'Nasa_Rakete_small.glb'));

// Check if it's a GLB (binary GLTF)
const magic = buffer.subarray(0, 4).toString();
console.log('Magic:', magic);

if (magic === 'glTF') {
  console.log('GLB format detected');
  
  // Parse GLB header
  const version = buffer.readUInt32LE(4);
  const length = buffer.readUInt32LE(8);
  console.log('Version:', version);
  console.log('Total length:', length);
  
  // Parse chunks
  let offset = 12;
  while (offset < length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString();
    console.log(`\nChunk at offset ${offset}: type=${chunkType}, length=${chunkLength}`);
    
    if (chunkType === 'JSON') {
      const jsonData = buffer.subarray(offset + 8, offset + 8 + chunkLength).toString();
      const gltf = JSON.parse(jsonData);
      console.log('\n=== GLTF JSON ===');
      console.log('Scenes:', gltf.scenes?.length);
      console.log('Nodes:', gltf.nodes?.length);
      console.log('Meshes:', gltf.meshes?.length);
      console.log('Materials:', gltf.materials?.length);
      console.log('Animations:', gltf.animations?.length);
      
      if (gltf.nodes) {
        console.log('\n=== NODE HIERARCHY ===');
        gltf.nodes.forEach((node, i) => {
          console.log(`Node ${i}: ${node.name || '(unnamed)'}`);
          if (node.children) {
            console.log(`  Children: ${node.children.join(', ')}`);
          }
          if (node.mesh !== undefined) {
            console.log(`  Mesh: ${node.mesh}`);
          }
        });
      }
      
      if (gltf.meshes) {
        console.log('\n=== MESHES ===');
        gltf.meshes.forEach((mesh, i) => {
          console.log(`Mesh ${i}: ${mesh.name || '(unnamed)'}`);
          mesh.primitives.forEach((prim, j) => {
            console.log(`  Primitive ${j}: mode=${prim.mode}, material=${prim.material}, attributes=${Object.keys(prim.attributes).join(', ')}`);
          });
        });
      }
    } else if (chunkType === 'BIN\x00') {
      console.log('Binary chunk (buffer data)');
    }
    
    offset += 8 + chunkLength;
    // Align to 4 bytes
    offset = (offset + 3) & ~3;
  }
} else {
  console.log('Not a GLB file, might be regular GLTF');
}