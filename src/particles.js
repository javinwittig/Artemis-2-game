import * as THREE from 'three';

// Camera-facing quads, one instance per particle. Simulation runs on the CPU,
// the GPU only expands the quads, so a few thousand particles stay cheap.

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec2 iSR; // size, rotation
varying vec2 vUv;
varying vec4 vCol;
varying float vFogDepth;
void main() {
  vUv = uv;
  vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSR.y), s = sin(iSR.y);
  mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iSR.x;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying vec4 vCol;
varying float vFogDepth;
void main() {
  vec4 tex = texture2D(map, vUv);
  float a = vCol.a * tex.a;
  if (a < 0.002) discard;
  float fog = smoothstep(fogNear, fogFar, vFogDepth);
#ifdef ADDITIVE
  gl_FragColor = vec4(vCol.rgb * tex.rgb * a * (1.0 - fog), 1.0);
#else
  gl_FragColor = vec4(mix(vCol.rgb * tex.rgb, fogColor, fog), a);
#endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSpriteTexture(kind) {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d');
  const radial = (stops) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  };
  if (kind === 'smoke') {
    // overlapping soft blobs give a lumpy, cauliflower-like puff
    for (let i = 0; i < 24; i++) {
      const r = s * (0.12 + Math.random() * 0.18);
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * s * 0.22;
      const x = s / 2 + Math.cos(ang) * dist;
      const y = s / 2 + Math.sin(ang) * dist;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.4)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
    g.globalCompositeOperation = 'destination-in';
    const mask = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mask;
    g.fillRect(0, 0, s, s);
  } else if (kind === 'fire') {
    radial([[0, 1], [0.3, 0.8], [0.65, 0.25], [1, 0]]);
  } else if (kind === 'spark') {
    radial([[0, 1], [0.12, 0.95], [0.35, 0.18], [1, 0]]);
  } else {
    radial([[0, 1], [0.2, 0.55], [0.5, 0.14], [1, 0]]);
  }
  return new THREE.CanvasTexture(canvas);
}

export class ParticleSystem {
  constructor({ max, texture, additive = false }) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    for (const a of [this.aPos, this.aCol, this.aSR]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iSR', this.aSR);
    geo.instanceCount = 0;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fogColor: { value: new THREE.Color() },
        fogNear: { value: 1 },
        fogFar: { value: 2 },
        fogDensity: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: additive ? { ADDITIVE: '' } : {},
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;

    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    this.cursor = 0;
  }

  /**
   * o: { x, y, z, vx, vy, vz, life, size, sizeEnd, color: [r,g,b], colorEnd, alpha,
   *      drag, gravity, spin, fadeIn } — colors may exceed 1 for bloom.
   */
  emit(o) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    const i3 = i * 3;
    const i4 = i * 4;
    const P = this.aPos.array;
    P[i3] = o.x; P[i3 + 1] = o.y; P[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.size0[i] = o.size;
    this.size1[i] = o.sizeEnd ?? o.size;
    const c = o.color;
    const ce = o.colorEnd || c;
    this.c0[i4] = c[0]; this.c0[i4 + 1] = c[1]; this.c0[i4 + 2] = c[2]; this.c0[i4 + 3] = o.alpha ?? 1;
    this.c1[i3] = ce[0]; this.c1[i3 + 1] = ce[1]; this.c1[i3 + 2] = ce[2];
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = o.spin || 0;
    this.drag[i] = o.drag || 0;
    this.grav[i] = o.gravity || 0;
    this.fadeIn[i] = o.fadeIn ?? 0.08;
  }

  update(dt) {
    const P = this.aPos.array;
    const C = this.aCol.array;
    const S = this.aSR.array;
    const V = this.vel;
    let top = -1;
    for (let i = 0; i < this.max; i++) {
      const life = this.life[i];
      if (life <= 0) continue;
      const i2 = i * 2;
      const i3 = i * 3;
      const i4 = i * 4;
      const age = this.age[i] + dt;
      if (age >= life) {
        this.life[i] = 0;
        C[i4 + 3] = 0;
        S[i2] = 0;
        continue;
      }
      this.age[i] = age;
      const t = age / life;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= damp;
      V[i3 + 1] = V[i3 + 1] * damp + this.grav[i] * dt;
      V[i3 + 2] *= damp;
      P[i3] += V[i3] * dt;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt;
      const grow = 1 - (1 - t) * (1 - t);
      S[i2] = this.size0[i] + (this.size1[i] - this.size0[i]) * grow;
      this.rot[i] += this.spin[i] * dt;
      S[i2 + 1] = this.rot[i];
      C[i4] = this.c0[i4] + (this.c1[i3] - this.c0[i4]) * t;
      C[i4 + 1] = this.c0[i4 + 1] + (this.c1[i3 + 1] - this.c0[i4 + 1]) * t;
      C[i4 + 2] = this.c0[i4 + 2] + (this.c1[i3 + 2] - this.c0[i4 + 2]) * t;
      C[i4 + 3] = this.c0[i4 + 3] * Math.min(1, t / this.fadeIn[i]) * (1 - t);
      top = i;
    }
    this.mesh.geometry.instanceCount = top + 1;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSR.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.aCol.array.fill(0);
    this.aSR.array.fill(0);
    this.mesh.geometry.instanceCount = 0;
  }
}

// Random unit vector helper shared by the effect code.
export function randomDir(out) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return out.set(r * Math.cos(a), u, r * Math.sin(a));
}
