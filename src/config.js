// All tuning values in one place. Distances are in model units
// (the SLS stack is ~380 units tall, the HUD shows 1 unit as 10 m).

export const IS_MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const QUALITY = IS_MOBILE
  ? { maxPixelRatio: 1.5, antialias: false, bloom: false, shadows: false, fire: 1400, smoke: 1300, sparks: 700, stars: 2500, asteroidDetail: 2 }
  : { maxPixelRatio: 2, antialias: true, bloom: true, shadows: true, fire: 2600, smoke: 2800, sparks: 1400, stars: 5000, asteroidDetail: 3 };

export const CONFIG = {
  model: {
    core: 'Circle',        // core stage + Orion
    boosters: 'Circle001', // both SRBs in one mesh
    nozzleHost: 'Circle008', // launch tower mesh that also holds the six nozzles
    // top of the mobile launcher deck; the exported stack floats ~200 units above it
    deckY: 94.5,
  },

  world: {
    earthRadius: 250000,
    groundY: -45, // earth surface below the launch site terrain
  },

  title: { radius: 950, height: 210, lookY: 290, speed: 0.06 },

  launch: {
    countdown: 10,
    mainEngineStart: 3.5, // RS-25 start, seconds before T-0
    holdDown: 0.3,        // SRB ignition -> first motion
    ascentDuration: 6.5,
    ascentAltitude: 6000,
    roll: [2.0, 4.8],     // roll program window (seconds after first motion)
    liftoffCam: { radius: 950, height: 110 },
    // camera angles (radians around the pad) with a clear line of sight between the
    // lightning towers and the launch tower; the countdown orbit ends inside one of them
    clearViews: [[2.65, 3.7], [4.65, 5.55], [0.5, 1.5]],
  },

  sky: { spaceFrom: 500, spaceTo: 8000 },

  transition: { duration: 3.2, boosterSep: 0.3 },

  game: {
    speedStart: 1500,
    speedMax: 3200,
    speedRamp: 150,     // seconds to reach top speed
    steerSpeed: 950,
    steerResponse: 7,
    boundsX: 560,
    boundsY: 330,
    camBack: 760,
    camUp: 230,
    lookAhead: 900,
    camFollow: 0.75,    // how much the camera follows sideways steering
    spawnAhead: 9000,
    kmPerUnit: 0.01,
    respawnTime: 1.1,
    graceTime: 2.0,
    deathDelay: 1.8,
    earthRecede: 0.04,  // extra earth distance per unit flown
  },

  asteroids: {
    minR: 35,
    maxR: 170,
    rateStart: 1.6,
    rateMax: 8,
    rateRamp: 120,
    aimed: 0.35,
    fieldX: 760,
    fieldY: 470,
    perVariant: 48,
    variants: 6,
  },

  powerups: {
    first: 9,
    intervalMin: 14,
    intervalMax: 22,
    shieldTime: 5,
    warnTime: 1,
    collectRadius: 150,
  },

  storage: { best: 'artemis2-best-km', muted: 'artemis2-muted' },
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t) => {
  t = clamp01(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const rand = (a, b) => a + Math.random() * (b - a);

// Distance from point p to the segment a-b (all THREE.Vector3).
export function distToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
  t = clamp01(t);
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
