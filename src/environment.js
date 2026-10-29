import * as THREE from 'three';
import { CONFIG, lerp, smoothstep, rand } from './config.js';

export const NOISE_GLSL = `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s / 0.96875;
}`;

const HORIZON_DAY = new THREE.Color().setRGB(0.52, 0.68, 0.88);
const SPACE_HAZE = new THREE.Color().setRGB(0.18, 0.32, 0.6);
const BLACK = new THREE.Color(0, 0, 0);

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `
uniform vec3 uSunDir;
uniform vec3 uHorizon;
uniform float uSpace;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.07, 0.22, 0.62);
  vec3 day = mix(uHorizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  float s = max(dot(d, uSunDir), 0.0);
  day += vec3(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.25;
  float f = clamp(uSpace * (1.0 + 0.7 * h), 0.0, 1.0);
  vec3 col = mix(day, vec3(0.0, 0.002, 0.008), f);
  col += vec3(1.0, 0.95, 0.85) * (pow(s, 900.0) * 30.0 + pow(s, 40.0) * 0.12 * uSpace);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uPixelRatio;
uniform float uTime;
varying vec3 vColor;
varying float vTw;
void main() {
  vColor = aColor;
  vTw = 0.75 + 0.25 * sin(uTime * (1.5 + aPhase) + aPhase * 20.0);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_PointSize = aSize * uPixelRatio;
}`;

const STAR_FRAG = `
uniform float uAlpha;
varying vec3 vColor;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * uAlpha * vTw;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const EARTH_VERT = `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = `
uniform vec3 uSunDir;
uniform vec3 uHaze;
uniform float uHazeDist;
uniform float uClouds;
uniform float uRim;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vLocal);
  vec3 N = normalize(vNormalW);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  float c = fbm(n * 2.4 + vec3(3.1, 1.7, 5.2));
  float site = exp(-pow(length(n.xz) / 0.03, 2.0));
  float land = smoothstep(0.5, 0.53, c + site * 0.5);
  float near = 1.0 - smoothstep(3000.0, 25000.0, dist);

  float d1 = fbm(n * 38.0);
  vec3 landCol = mix(vec3(0.16, 0.25, 0.09), vec3(0.36, 0.33, 0.2), d1);
  landCol = mix(landCol, vec3(0.5, 0.45, 0.32), smoothstep(0.55, 0.75, fbm(n * 11.0 + 4.0)));
  landCol *= 0.8 + 0.4 * vnoise(n * 1400.0) * near;
  vec3 ocean = mix(vec3(0.01, 0.035, 0.1), vec3(0.03, 0.12, 0.22), smoothstep(0.35, 0.5, c));
  vec3 col = mix(ocean, landCol, land);
  col = mix(col, vec3(0.85, 0.88, 0.92), smoothstep(0.86, 0.93, abs(n.x)));

  float sunDot = dot(N, uSunDir);
  float diff = smoothstep(-0.12, 0.6, sunDot);
  vec3 lit = col * (0.03 + 1.25 * diff);
  vec3 H = normalize(V + uSunDir);
  lit += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, H), 0.0), 80.0) * (1.0 - land) * 0.5 * diff;

  float cl = smoothstep(0.55, 0.78, fbm(n * 7.0 + vec3(uTime * 0.003, 0.0, 0.0))) * uClouds;
  lit = mix(lit, vec3(0.04 + 1.15 * diff), cl * 0.85);

  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  lit = mix(lit, vec3(0.3, 0.55, 1.0) * (0.15 + diff), fres * 0.8 * uRim);
  lit = mix(lit, uHaze, 1.0 - exp(-dist / uHazeDist));
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = `
uniform vec3 uCenter;
uniform vec3 uSunDir;
uniform float uR;
uniform float uRs;
uniform float uAlpha;
varying vec3 vWorld;
void main() {
  vec3 rd = normalize(vWorld - cameraPosition);
  vec3 oc = uCenter - cameraPosition;
  float tca = dot(oc, rd);
  float p = sqrt(max(dot(oc, oc) - tca * tca, 0.0));
  float h = clamp((p - uR) / (uRs - uR), 0.0, 1.0);
  vec3 closest = normalize(cameraPosition + rd * tca - uCenter);
  float lit = smoothstep(-0.25, 0.5, dot(closest, uSunDir));
  vec3 col = vec3(0.3, 0.55, 1.0) * pow(1.0 - h, 3.0) * (0.15 + 1.1 * lit);
  gl_FragColor = vec4(col * uAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const MOON_FRAG = `
uniform vec3 uSunDir;
uniform float uAlpha;
varying vec3 vLocal;
varying vec3 vNormalW;
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vLocal);
  float maria = smoothstep(0.48, 0.6, fbm(n * 1.8 + 7.0));
  float detail = fbm(n * 9.0);
  float craters = smoothstep(0.62, 0.7, vnoise(n * 26.0)) * 0.25;
  vec3 col = vec3(0.62, 0.6, 0.57) * (0.75 + 0.35 * detail) * (1.0 - maria * 0.4) * (1.0 - craters);
  float diff = max(dot(normalize(vNormalW), uSunDir), 0.0);
  gl_FragColor = vec4(col * (0.02 + 1.4 * diff), uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Environment {
  constructor(scene, { starCount, pixelRatio }) {
    this.scene = scene;
    this.R = CONFIG.world.earthRadius;
    this.sunDir = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();
    this.time = 0;

    this.fog = new THREE.Fog(HORIZON_DAY.clone(), 4000, 40000);
    scene.fog = this.fog;

    this.createSky();
    this.createStars(starCount, pixelRatio);
    this.createEarth();
    this.createMoon();
    this.createStreaks();
  }

  createSky() {
    this.skyUniforms = {
      uSunDir: { value: this.sunDir },
      uHorizon: { value: HORIZON_DAY },
      uSpace: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  createStars(count, pixelRatio) {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) { i--; continue; }
      v.normalize().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = Math.random() < 0.06;
      size[i] = big ? rand(2.4, 3.6) : rand(0.9, 2.0);
      phase[i] = Math.random();
      const t = Math.random();
      const b = big ? 1.6 : rand(0.5, 1.1);
      color.set(t < 0.2 ? [0.75 * b, 0.85 * b, b] : t > 0.88 ? [b, 0.85 * b, 0.65 * b] : [b, b, b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.starUniforms = { uAlpha: { value: 0 }, uPixelRatio: { value: pixelRatio }, uTime: { value: 0 } };
    this.stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.stars.renderOrder = -5;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  createEarth() {
    const R = this.R;
    this.earthPivot = new THREE.Group();
    this.earthPivot.name = 'earth';
    this.scene.add(this.earthPivot);
    this.earthBase = new THREE.Vector3(0, CONFIG.world.groundY - R, 0);

    this.earthUniforms = {
      uSunDir: { value: this.sunDir },
      uHaze: { value: HORIZON_DAY.clone() },
      uHazeDist: { value: 22000 },
      uClouds: { value: 0 },
      uRim: { value: 0 },
      uTime: { value: 0 },
    };
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 160, 120),
      new THREE.ShaderMaterial({ uniforms: this.earthUniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }),
    );
    this.earth.frustumCulled = false;
    this.earthPivot.add(this.earth);

    this.atmoUniforms = {
      uCenter: { value: new THREE.Vector3() },
      uSunDir: { value: this.sunDir },
      uR: { value: R },
      uRs: { value: R * 1.012 },
      uAlpha: { value: 0 },
    };
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.012, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.atmosphere.renderOrder = -3;
    this.atmosphere.frustumCulled = false;
    this.earthPivot.add(this.atmosphere);
  }

  createMoon() {
    this.moonUniforms = { uSunDir: { value: this.sunDir }, uAlpha: { value: 0 } };
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: this.moonUniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: MOON_FRAG,
        transparent: true,
      }),
    );
    this.moon.renderOrder = -4;
    this.moon.frustumCulled = false;
    this.moonDir = new THREE.Vector3(-0.16, 0.1, -1).normalize();
    this.scene.add(this.moon);
  }

  createStreaks() {
    const n = 160;
    this.streakData = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.resetStreak(i, rand(-9000, 300));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(0.55, 0.75, 1.0),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.scene.add(this.streaks);
  }

  resetStreak(i, z) {
    let x;
    let y;
    do {
      x = rand(-1600, 1600);
      y = rand(-900, 900);
    } while (Math.abs(x) < 260 && Math.abs(y) < 200);
    this.streakData[i * 3] = x;
    this.streakData[i * 3 + 1] = y;
    this.streakData[i * 3 + 2] = z;
  }

  attachLaunchSite(site, padPivot) {
    this.earthBase.set(padPivot.x, CONFIG.world.groundY - this.R, padPivot.z);
    site.position.set(-padPivot.x, this.R - CONFIG.world.groundY, -padPivot.z);
    this.earthPivot.add(site);
    this.site = site;
  }

  update(dt, camera, o) {
    this.time += dt;
    const s = o.spaceT;
    const cam = camera.position;

    this.sky.position.copy(cam);
    this.stars.position.copy(cam);
    this.skyUniforms.uSpace.value = s;
    this.starUniforms.uAlpha.value = smoothstep(0.35, 0.95, s);
    this.starUniforms.uTime.value = this.time;

    this.earthPivot.position.set(this.earthBase.x, this.earthBase.y - o.earthDrop, this.earthBase.z + o.flightDz);
    this.earthPivot.rotation.x = -o.flightDz / this.R;
    const eu = this.earthUniforms;
    eu.uHazeDist.value = lerp(26000, 900000, smoothstep(0.1, 0.9, s));
    eu.uHaze.value.copy(HORIZON_DAY).lerp(SPACE_HAZE, smoothstep(0.2, 0.8, s));
    eu.uClouds.value = smoothstep(1500, 7000, o.altitude);
    eu.uRim.value = smoothstep(0.4, 1, s);
    eu.uTime.value = this.time;
    this.atmoUniforms.uCenter.value.copy(this.earthPivot.position);
    const shellDist = cam.distanceTo(this.earthPivot.position) - this.atmoUniforms.uRs.value;
    this.atmoUniforms.uAlpha.value = smoothstep(0.5, 1, s) * smoothstep(0, 3000, shellDist);

    this.fog.color.copy(HORIZON_DAY).lerp(BLACK, smoothstep(0.25, 0.85, s));
    this.fog.near = lerp(4000, 4500, s);
    this.fog.far = lerp(40000, 12000, s);

    const moonDist = 320000;
    const grow = 1 + Math.min(Math.abs(o.flightDz) / 2.5e6, 1.5);
    this.moon.position.copy(cam).addScaledVector(this.moonDir, moonDist);
    this.moon.scale.setScalar(9000 * grow);
    this.moonUniforms.uAlpha.value = smoothstep(0.55, 1, s);
    this.moon.visible = s > 0.5;

    this.updateStreaks(dt, cam, o.speed || 0, o.streaks || 0);
  }

  updateStreaks(dt, cam, speed, alpha) {
    this.streaks.visible = alpha > 0.01;
    if (!this.streaks.visible) return;
    this.streaks.position.copy(cam);
    this.streaks.material.opacity = alpha * 0.4;
    const data = this.streakData;
    const out = this.streaks.geometry.attributes.position;
    const len = speed * 0.06;
    for (let i = 0; i < data.length / 3; i++) {
      data[i * 3 + 2] += speed * dt;
      if (data[i * 3 + 2] > 300) this.resetStreak(i, data[i * 3 + 2] - 9300);
      const x = data[i * 3];
      const y = data[i * 3 + 1];
      const z = data[i * 3 + 2];
      out.setXYZ(i * 2, x, y, z);
      out.setXYZ(i * 2 + 1, x, y, z - len);
    }
    out.needsUpdate = true;
  }

  setPixelRatio(pr) {
    this.starUniforms.uPixelRatio.value = pr;
  }
}
