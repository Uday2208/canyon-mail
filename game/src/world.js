// The sortie: rings, score, fuel, landings and crashes. One step advances
// the plane and then asks the world what happened: a ring passed, a landing
// made, the ground met too hard, or the tanks run dry.
import { COURSE, SCORE, STEP } from './config.js';
import { createPlane, stepPlane } from './plane.js';
import { buildRings, groundHeight, onRunway } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_FUEL = 8;

export function createWorld() {
  return {
    plane: createPlane(),
    rings: buildRings(),
    ringIndex: 0,
    score: 0,
    time: 0,
    status: 'flying', // flying | crashed | landed | outoffuel
    message: '',
    fuelWarned: false,
  };
}

export function resetWorld(w) {
  const fresh = createWorld();
  w.plane = fresh.plane;
  w.rings = fresh.rings;
  w.ringIndex = 0;
  w.score = 0;
  w.time = 0;
  w.status = 'flying';
  w.message = '';
  w.fuelWarned = false;
}

/**
 * Step the world once. Returns an event bitmask (EVENT_*). `ctl` is the
 * pilot input for this step; `quiet` skips crash/landing (title attract).
 */
export function stepWorld(w, ctl, dt = STEP) {
  if (w.status !== 'flying') return 0;
  w.time += dt;
  const p = w.plane;
  const prevZ = p.z;
  const prevY = p.y;
  stepPlane(p, ctl, dt);
  let events = 0;

  // Ring passed: crossed the ring's z plane inside its circle.
  if (w.ringIndex < w.rings.length) {
    const ring = w.rings[w.ringIndex];
    if (prevZ < ring.z && p.z >= ring.z) {
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      if (dx * dx + dy * dy <= ring.r * ring.r) {
        ring.passed = true;
        w.ringIndex += 1;
        w.score += SCORE.ring;
        p.fuel = Math.min(100, p.fuel + 12);
        events |= EVENT_RING;
      }
    }
  }

  // Ground: the runway forgives a gentle touchdown, anything else is a crash.
  const ground = groundHeight(p.x, p.z);
  if (p.y <= ground + 1.2 && !p.onGround) {
    const verticalSpeed = (prevY - p.y) / dt;
    const gentle = onRunway(p.x, p.z) && p.speed < 42 && verticalSpeed < 9 && Math.abs(p.bank) < 0.25;
    if (gentle) {
      w.status = 'landed';
      p.onGround = true;
      p.y = ground + 1.2;
      const timeBonus = Math.max(0, Math.round(SCORE.timeBonusMax * (1 - w.time / SCORE.timeBonusAt)));
      w.score += SCORE.landing + timeBonus;
      w.message = `Mail delivered. ${w.ringIndex} of ${w.rings.length} rings, time bonus ${timeBonus}.`;
      events |= EVENT_LANDED;
    } else {
      w.status = 'crashed';
      w.message = p.y <= ground + 1.2 && onRunway(p.x, p.z) && p.speed >= 42
        ? 'Too fast for the strip — the mail plane broke up on the runway.'
        : 'Terrain strike. The mail plane is down in the canyon.';
      events |= EVENT_CRASH;
    }
    return events;
  }

  // Out of fuel: glide until the ground decides the ending.
  if (p.fuel <= 0 && !w.fuelWarned) {
    w.fuelWarned = true;
    events |= EVENT_FUEL;
  }

  // Flew past the end of the valley without landing: a missed approach.
  if (p.z > COURSE.endZ + 200) {
    w.status = 'crashed';
    w.message = 'Overshot the valley — the mail never arrived.';
    events |= EVENT_CRASH;
  }
  return events;
}

/** Distance and bearing to the next ring (or the landing strip) for the HUD. */
export function nextTarget(w) {
  const p = w.plane;
  const t = w.ringIndex < w.rings.length
    ? w.rings[w.ringIndex]
    : { x: 0, z: (COURSE.landRunway.z0 + COURSE.landRunway.z1) / 2, y: 2 };
  const dx = t.x - p.x;
  const dz = t.z - p.z;
  const dist = Math.hypot(dx, dz);
  let bearing = Math.atan2(dx, dz) - p.heading;
  while (bearing > Math.PI) bearing -= 2 * Math.PI;
  while (bearing < -Math.PI) bearing += 2 * Math.PI;
  return { dist, bearing, isRunway: w.ringIndex >= w.rings.length, label: w.ringIndex >= w.rings.length ? 'STRIP' : `RING ${w.ringIndex + 1}/6` };
}
