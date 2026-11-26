// The aeroplane: a single-engine mail plane and its flight model. Throttle
// sets a target speed, pitch sets climb or descent, bank turns the heading;
// climbing bleeds speed, diving gains it, and below stall speed the nose
// drops on its own. Fuel is the clock: full throttle burns it fastest.
import { PLANE } from './config.js';

export function createPlane() {
  return {
    x: 0,
    y: 2.2, // parked on the start runway
    z: 40,
    heading: 0, // 0 = north (+z); radians, grows to the east
    pitch: 0, // + = nose up
    bank: 0, // + = right wing down
    speed: 0,
    throttle: 0,
    fuel: 100,
    onGround: true,
  };
}

/**
 * Advance the plane one fixed step. `ctl` is { steer: -1..1, pitch: -1..1,
 * throttle: -1..1 } from the input; returns nothing, mutates the plane.
 */
export function stepPlane(p, ctl, dt) {
  // Throttle: W/S (or Up/Down) moves it; it stays where the pilot leaves it.
  p.throttle = Math.min(1, Math.max(0, p.throttle + ctl.throttle * dt * 0.9));
  const flying = !p.onGround;

  // Target speed from throttle; climbing costs speed, diving pays it back.
  let target = PLANE.maxSpeed * (0.15 + 0.85 * p.throttle);
  if (flying) target -= Math.sin(p.pitch) * 34;
  const rate = PLANE.accel * dt;
  p.speed += Math.min(rate, Math.max(-rate, target - p.speed));
  if (p.speed < 0) p.speed = 0;

  // Bank toward the commanded bank; heading follows the bank.
  const wantBank = ctl.steer * PLANE.maxBank;
  p.bank += Math.min(PLANE.bankRate * dt, Math.max(-PLANE.bankRate * dt, wantBank - p.bank));
  if (flying) {
    p.heading += p.bank * PLANE.turnRate * (p.speed / PLANE.cruiseSpeed) * dt;
  }

  // Pitch toward the commanded pitch; a stall drops the nose by itself.
  const wantPitch = ctl.pitch * PLANE.maxPitch;
  p.pitch += Math.min(PLANE.pitchRate * dt, Math.max(-PLANE.pitchRate * dt, wantPitch - p.pitch));
  if (flying && p.speed < PLANE.stallSpeed) {
    p.pitch -= (PLANE.stallSpeed - p.speed) * 0.012 * dt * 60 * 0.02;
    if (p.pitch < -PLANE.maxPitch) p.pitch = -PLANE.maxPitch;
  }

  // Move: forward along the heading, vertical from pitch and speed.
  const forward = p.speed * dt;
  p.x += Math.sin(p.heading) * forward;
  p.z += Math.cos(p.heading) * forward;
  if (flying) {
    p.y += Math.sin(p.pitch) * p.speed * dt;
    // A slow plane sinks even level: lift needs airspeed.
    if (p.speed < PLANE.cruiseSpeed) p.y -= (PLANE.cruiseSpeed - p.speed) * 0.05 * dt;
  }

  // Take off: enough speed and a little pull and the wheels leave the strip.
  if (p.onGround && p.speed > 34 && p.pitch > 0.03) {
    p.onGround = false;
    p.y = Math.max(p.y, 2.5);
  }

  // Fuel: throttle is the burn rate; empty tanks mean gliding only.
  if (p.throttle > 0) p.fuel -= PLANE.fuelDrain * p.throttle * dt;
  if (p.fuel <= 0) {
    p.fuel = 0;
    p.throttle = 0;
  }
  if (p.y < 0.5) p.y = 0.5;
}
