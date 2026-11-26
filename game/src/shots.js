// The screenshot scenes behind ?shot=start|play|ring|end. Each one flies the
// real rules forward from a fresh world for a fixed time, steered by a simple
// autopilot (bank toward the next ring, pitch toward its height, throttle
// held high, then a gentle approach to the strip), so every frame is what a
// real flight looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { resetWorld, stepWorld, EVENT_CRASH, EVENT_LANDED } from './world.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 600;

/** Throttle as a regulator: returns -1/0/1 to move toward `target`. */
function throttleToward(p, target) {
  if (p.throttle > target + 0.05) return -1;
  if (p.throttle < target - 0.05) return 1;
  return 0;
}

/** Steer toward the next ring (or the strip) and hold height on it. */
function autopilot(w) {
  const p = w.plane;
  const landing = w.ringIndex >= w.rings.length;
  if (landing) {
    // Final approach in two parts. First, line up on the extended centreline
    // and hold 34 m: the valley floor off the strip is rough, so the plane
    // never descends until it is over the asphalt. Then a shallow glide to
    // the strip, slow and level. Heading follows the centreline itself (a
    // line follower), never a point on it: steering at a point makes the
    // plane hunt side to side as the point draws near, and a banked
    // touchdown is a crash.
    const lookAhead = p.z > 4800 ? 150 : 300;
    const desiredHeading = Math.atan2(-p.x * 0.9, lookAhead);
    let err = desiredHeading - p.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const gain = p.z > 4800 ? 2.6 : 1.8;
    const steer = Math.max(-1, Math.min(1, err * gain));
    // The runway is only 32 m wide, so "lined up" means within 12 m of the
    // centreline, not 25: descending at 20 m off-centre puts the wheels in
    // the dunes beside the strip. Until then, hold 20 m, never lower.
    const linedUp = Math.abs(p.x) < 12;
    let wantAlt;
    if (p.z < 4950) wantAlt = 34;
    else if (!linedUp) wantAlt = 20;
    else wantAlt = Math.max(0, 20 - (p.z - 4950) * 0.075);
    const pitch = Math.max(-0.45, Math.min(0.7, (wantAlt - p.y) / 26));
    return { steer, pitch, throttle: throttleToward(p, 0.25) };
  }
  const ring = w.rings[w.ringIndex];
  const dx = ring.x - p.x;
  const dz = ring.z - p.z;
  const wantHeading = Math.atan2(dx, dz);
  let bearing = wantHeading - p.heading;
  while (bearing > Math.PI) bearing -= 2 * Math.PI;
  while (bearing < -Math.PI) bearing += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, bearing * 1.6));
  const pitch = Math.max(-1, Math.min(1, (ring.y - p.y) / 26));
  return { steer, pitch, throttle: throttleToward(p, 0.78) };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any unknown name stages the title scene.
 * `opts.t` overrides the play-scene length in seconds; `opts.d` overrides
 * how many metres short of the third ring the ring scene stops — staging
 * knobs for choosing the best screenshot, same seed either way.
 */
export function stageShot(name, world, opts = {}) {
  resetWorld(world);
  if (name !== 'play' && name !== 'ring' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) stepWorld(world, { steer: 0, pitch: 0, throttle: 0 });
    return { screen: 'title', best: 0 };
  }
  if (name === 'ring') {
    // Fly until the third ring fills the windscreen, then freeze the frame.
    const ring = world.rings[2];
    const stopShort = Number.isFinite(opts.d) && opts.d > 0 ? opts.d : 95;
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const events = stepWorld(world, autopilot(world));
      if (world.plane.z >= ring.z - stopShort || events & (EVENT_CRASH | EVENT_LANDED)) break;
    }
    return { screen: world.status === 'flying' ? 'play' : 'over', best: world.score };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : (Number.isFinite(opts.t) && opts.t > 0 ? opts.t : PLAY_SECONDS);
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = stepWorld(world, autopilot(world));
    if (events & (EVENT_CRASH | EVENT_LANDED)) break;
  }
  if (name === 'end') {
    const screen = world.status === 'landed' ? 'complete' : world.status === 'crashed' ? 'over' : 'play';
    return { screen, best: world.score };
  }
  const over = world.status !== 'flying';
  return { screen: over ? 'over' : 'play', best: world.score };
}
