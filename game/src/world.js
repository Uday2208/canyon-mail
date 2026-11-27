// The sortie: rings or drops, score, fuel, landings and crashes. One step
// advances the plane and then asks the world what happened: a ring passed,
// a parcel dropped, a landing made, the ground met too hard, or the tanks
// run dry. Two missions share the valley: 'rings' (six rings, then land)
// and 'drop' (three parcels to the outposts, then land).
import { COURSE, PLANE, SCORE, STEP } from './config.js';
import { createPlane, stepPlane } from './plane.js';
import { buildDropZones, buildRings, groundHeight, groundType, onRunway } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_FUEL = 8;
export const EVENT_DROP = 16;

export function createWorld(mode = 'rings') {
  return {
    mode,
    plane: createPlane(),
    rings: buildRings(),
    zones: buildDropZones(),
    ringIndex: 0,
    dropIndex: 0,
    score: 0,
    time: 0,
    status: 'flying', // flying | crashed | landed | outoffuel
    message: '',
    fuelWarned: false,
  };
}

export function resetWorld(w, mode) {
  const fresh = createWorld(mode ?? w.mode ?? 'rings');
  w.mode = fresh.mode;
  w.plane = fresh.plane;
  w.rings = fresh.rings;
  w.zones = fresh.zones;
  w.ringIndex = 0;
  w.dropIndex = 0;
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
  if (w.mode === 'rings' && w.ringIndex < w.rings.length) {
    const ring = w.rings[w.ringIndex];
    if (prevZ < ring.z && p.z >= ring.z) {
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      if (dx * dx + dy * dy <= ring.r * ring.r) {
        ring.passed = true;
        w.ringIndex += 1;
        w.score += SCORE.ring;
        p.fuel = Math.min(100, p.fuel + PLANE.fuelRingBonus);
        events |= EVENT_RING;
      }
    }
  }

  // Parcel dropped: SPACE over an outpost, low enough that the parcel
  // lands in the ring. The outpost tops the tanks up, like a ring does.
  if (w.mode === 'drop' && ctl.drop && w.dropIndex < w.zones.length) {
    const zone = w.zones[w.dropIndex];
    const dx = p.x - zone.x;
    const dz = p.z - zone.z;
    if (dx * dx + dz * dz <= zone.r * zone.r && p.y < groundHeight(zone.x, zone.z) + 45) {
      zone.delivered = true;
      w.dropIndex += 1;
      w.score += SCORE.drop;
      p.fuel = Math.min(100, p.fuel + PLANE.fuelRingBonus);
      events |= EVENT_DROP;
    }
  }

  // Ground: the runway forgives a gentle touchdown, and the flat ground
  // beside it forgives one a few metres wide of the asphalt at half the
  // landing bonus, or a rough one further out at a quarter — a bush
  // landing still delivers the mail, and aiming for the asphalt is what
  // the full bonus pays for. Ditching in the river is a crash, and the
  // message says which ending it was.
  const ground = groundHeight(p.x, p.z);
  if (p.y <= ground + 1.2 && !p.onGround) {
    const verticalSpeed = (prevY - p.y) / dt;
    const speedOk = p.speed < 46;
    const sinkOk = verticalSpeed < 11;
    const levelOk = Math.abs(p.bank) < 0.35;
    const gentle = speedOk && sinkOk && levelOk;
    const onStrip = onRunway(p.x, p.z);
    const l = COURSE.landRunway;
    const nearStrip = p.z >= l.z0 - 10 && p.z <= l.z1 + 10;
    const onApron = nearStrip && Math.abs(p.x) <= 40 && ground <= 2;
    const onRough = nearStrip && Math.abs(p.x) <= 110 && ground <= 2.5;
    const inRiver = groundType(p.x, p.z) === 'water';
    if (gentle && !inRiver && (onStrip || onApron || onRough)) {
      w.status = 'landed';
      p.onGround = true;
      p.y = ground + 1.2;
      const timeBonus = Math.max(0, Math.round(SCORE.timeBonusMax * (1 - w.time / SCORE.timeBonusAt)));
      const landingBonus = onStrip ? SCORE.landing : onApron ? Math.round(SCORE.landing / 2) : Math.round(SCORE.landing / 4);
      w.score += landingBonus + timeBonus;
      const done = w.mode === 'drop' ? w.dropIndex : w.ringIndex;
      const total = w.mode === 'drop' ? w.zones.length : w.rings.length;
      const noun = w.mode === 'drop' ? 'drops' : 'rings';
      w.message = onStrip
        ? `Mail delivered. ${done} of ${total} ${noun}, time bonus ${timeBonus}.`
        : onApron
          ? `Mail delivered — rough landing beside the strip. ${done} of ${total} ${noun}, time bonus ${timeBonus}.`
          : `Mail delivered — rough landing in the sand, well wide of the strip. ${done} of ${total} ${noun}, time bonus ${timeBonus}.`;
      events |= EVENT_LANDED;
    } else {
      w.status = 'crashed';
      w.message = inRiver
        ? 'Ditched in the river — the mail got wet.'
        : onStrip && p.speed >= 46
          ? 'Too fast for the strip — the mail plane broke up on the runway.'
          : !onStrip && gentle
            ? 'Off the strip — the mail plane stopped in the sand beside the runway.'
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

/** Distance and bearing to the next target for the HUD: the next ring, the
 * next drop outpost, or the landing strip once the mission is done. */
export function nextTarget(w) {
  const p = w.plane;
  if (w.status === 'landed') return { dist: 0, bearing: 0, alt: 2, isRunway: true, label: 'LANDED' };
  if (w.mode === 'drop' && w.dropIndex < w.zones.length) {
    const t = w.zones[w.dropIndex];
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const dist = Math.hypot(dx, dz);
    let bearing = Math.atan2(dx, dz) - p.heading;
    while (bearing > Math.PI) bearing -= 2 * Math.PI;
    while (bearing < -Math.PI) bearing += 2 * Math.PI;
    return { dist, bearing, alt: Math.round(t.y), isRunway: false, label: `DROP ${w.dropIndex + 1}/3` };
  }
  const t = w.mode === 'drop' || w.ringIndex >= w.rings.length
    ? { x: 0, z: (COURSE.landRunway.z0 + COURSE.landRunway.z1) / 2, y: 2 }
    : w.rings[w.ringIndex];
  const dx = t.x - p.x;
  const dz = t.z - p.z;
  const dist = Math.hypot(dx, dz);
  let bearing = Math.atan2(dx, dz) - p.heading;
  while (bearing > Math.PI) bearing -= 2 * Math.PI;
  while (bearing < -Math.PI) bearing += 2 * Math.PI;
  // alt: how high the target sits. The old HUD never showed it, so a pilot
  // could steer onto the bearing and still fly 20 m over or under the ring.
  const isRunway = w.mode === 'drop' || w.ringIndex >= w.rings.length;
  return { dist, bearing, alt: Math.round(t.y), isRunway, label: isRunway ? 'STRIP' : `RING ${w.ringIndex + 1}/6` };
}
