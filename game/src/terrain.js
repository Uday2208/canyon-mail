// The canyon: a desert valley the mail route follows. Everything is a pure
// function of (x, z) and the seed, so the world is identical every run and
// the renderer, the physics and the screenshots all agree about the ground.
import { COURSE, DROP_ZONE_DEFS, RING_DEFS } from './config.js';
import { noise2 } from './random.js';

const SEED = 20261126;

// Flat-topped mesas dotted along the valley, fixed by the seed.
const MESAS = [
  { x: -300, z: 700, r: 120, h: 74 },
  { x: 320, z: 1300, r: 150, h: 88 },
  { x: -330, z: 2050, r: 110, h: 66 },
  { x: 300, z: 2700, r: 140, h: 96 },
  { x: -290, z: 3350, r: 130, h: 80 },
  { x: 330, z: 4050, r: 120, h: 70 },
  // Mesa-7 stands clear west of the landing approach: its old seat crowded
  // the glide path, and a pilot lining up from ring 6 met its slope.
  { x: -400, z: 4650, r: 120, h: 88 },
  // Mesa-8 stands clear east of the strip's far end: its old seat crowded
  // the overshoot side, where a pilot who flies past the threshold goes.
  { x: 400, z: 5150, r: 110, h: 64 },
];

/** The river's centre x at a given z: it winds down the valley floor. */
export function riverX(z) {
  return 95 * Math.sin(z * 0.0011) + 42 * Math.sin(z * 0.00037 + 1.7);
}

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(a, b, t) {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
}

/** True when (x, z) is on one of the two runways (flat asphalt). */
export function onRunway(x, z) {
  const s = COURSE.startRunway;
  const l = COURSE.landRunway;
  return (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1)
    || (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1);
}

/** Ground height in metres at (x, z). */
export function groundHeight(x, z) {
  if (onRunway(x, z)) return 0;
  // Valley floor: gentle rolling dunes.
  let h = 6 + 7 * noise2(x, z, 260, SEED) + 3 * noise2(x, z, 90, SEED + 5);
  // Canyon walls rise steeply past the valley edge.
  const wall = smoothstep(COURSE.canyonHalfWidth - 60, COURSE.canyonHalfWidth + 180, Math.abs(x));
  h += wall * (110 + 26 * noise2(x, z, 320, SEED + 11));
  // Mesas: flat tops with steep sides.
  for (let i = 0; i < MESAS.length; i += 1) {
    const m = MESAS[i];
    const d = Math.hypot(x - m.x, z - m.z);
    h += m.h * (1 - smoothstep(m.r * 0.55, m.r, d));
  }
  // Landing approach corridor: the valley floor the mail route descends
  // over is graded flat toward the strip, and the shoulders beside the
  // strip are level ground — a pilot on the glide path meets smooth earth,
  // not dunes, and a touchdown a few metres wide of the asphalt stops in
  // the sand instead of a dune face. The floor sits at river-plain height
  // (2 m), low enough that a 3-degree glide clears it until the strip; the
  // river still cuts through it below, so the flat is a river plain, not
  // a scar.
  const corridor = (1 - smoothstep(200, 280, Math.abs(x)))
    * smoothstep(4300, 4600, z) * (1 - smoothstep(5450, 5600, z));
  if (corridor > 0) h = h * (1 - corridor) + 2 * corridor;
  const apron = (1 - smoothstep(36, 60, Math.abs(x)))
    * smoothstep(4900, 5000, z) * (1 - smoothstep(5400, 5500, z));
  if (apron > 0) h = h * (1 - apron) + 0.5 * apron;
  // The river cuts a shallow channel through the floor.
  const river = Math.abs(x - riverX(z));
  h -= 4.5 * (1 - smoothstep(6, 26, river));
  return h;
}

/** What the ground looks like at (x, z): sand, rock, grass, water or runway. */
export function groundType(x, z) {
  if (onRunway(x, z)) return 'runway';
  if (Math.abs(x - riverX(z)) < 13) return 'water';
  const h = groundHeight(x, z);
  if (h > 55) return 'rock';
  const g = noise2(x, z, 180, SEED + 23);
  return g > 0.62 ? 'grass' : 'sand';
}

export const GROUND_COLORS = {
  sand: '#c98f4e',
  sandDark: '#c68a4b',
  rock: '#8a5f43',
  rockDark: '#855c40',
  grass: '#7d8f4a',
  water: '#3f7fa8',
  runway: '#3c3f45',
  runwayLine: '#e8e4d2',
};

/** The mail rings, with heights resolved against the terrain. */
export function buildRings() {
  return RING_DEFS.map((r) => ({
    x: r.x,
    z: r.z,
    r: r.r,
    y: Math.max(groundHeight(r.x, r.z), 0) + r.lift,
    passed: false,
  }));
}

/** The Mail Drop outposts, with heights resolved against the terrain. */
export function buildDropZones() {
  return DROP_ZONE_DEFS.map((d) => ({
    x: d.x,
    z: d.z,
    r: d.r,
    y: Math.max(groundHeight(d.x, d.z), 0) + 18,
    delivered: false,
  }));
}

export { MESAS };
