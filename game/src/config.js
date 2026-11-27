// Canyon Mail — tuning constants. One job: every number the flight model,
// the course and the renderer share, so a balance change happens here only.
export const STEP = 1 / 60;
export const BEST_KEY = 'canyon-mail-best';

// Course layout (world units are metres; +z is north, the direction of flight).
export const COURSE = {
  startRunway: { x0: -16, x1: 16, z0: -80, z1: 300 },
  landRunway: { x0: -20, x1: 20, z0: 5000, z1: 5400 },
  endZ: 5450,
  canyonHalfWidth: 460,
};

// The six mail rings, in flight order. y is set above the terrain at build time.
export const RING_DEFS = [
  { x: 60, z: 900, r: 20, lift: 62 },
  { x: -120, z: 1600, r: 18, lift: 78 },
  { x: 140, z: 2300, r: 20, lift: 58 },
  { x: -40, z: 3000, r: 16, lift: 88 },
  { x: 170, z: 3700, r: 18, lift: 66 },
  { x: -150, z: 4400, r: 20, lift: 74 },
];

// The three Mail Drop outposts: a river-bank camp (clear east of the
// water and clear of the mesas), an open flat west of the mesas, and a
// marker on the way to the strip. y is set above the terrain. Each one
// sits on flat ground with a clear low-pass circle around it: the first
// draft put the river camp on a mesa flank, and the low pass met rock.
export const DROP_ZONE_DEFS = [
  { x: 60, z: 1000, r: 26 },
  { x: 120, z: 2750, r: 26 },
  { x: -40, z: 4600, r: 26 },
];

// Flight model.
export const PLANE = {
  maxSpeed: 96, // m/s at full throttle, level
  cruiseSpeed: 58, // m/s the throttle settles toward at 0.62
  stallSpeed: 26, // below this the nose drops
  accel: 14, // m/s^2 toward the throttle target speed
  climbRate: 16, // m/s vertical at full pitch up and speed
  sinkRate: 22, // m/s vertical at full pitch down
  bankRate: 1.9, // rad/s toward the commanded bank
  maxBank: 0.85, // rad, about 49 degrees
  turnRate: 0.55, // heading rad/s at max bank and cruise speed
  pitchRate: 1.1, // rad/s toward the commanded pitch
  maxPitch: 0.42, // rad, about 24 degrees
  fuelDrain: 1.6, // percent per second at full throttle: a sortie flown
  // flat-out burns ~90% before the rings pay it back, so throttle and ring
  // discipline decide whether the tanks last to the strip.
  fuelRingBonus: 10, // percent back per ring
};

// Scoring.
export const SCORE = {
  ring: 100,
  drop: 150,
  landing: 500,
  timeBonusMax: 300, // at 90 s; fades to 0 at 240 s
  timeBonusAt: 240,
};

// Camera.
export const CAMERA = {
  focal: 640, // projection focal length in pixels at 1280x720
  behind: 15, // metres behind the plane
  above: 4.5, // metres above the plane
  lookAhead: 46, // metres ahead of the plane the camera aims at
};
