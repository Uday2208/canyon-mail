// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, crashed and mission complete.
//
// ?shot=start|play|ring|end (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady so a
// screenshot knows the frame is settled.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, resetWorld, stepWorld, nextTarget, EVENT_CRASH, EVENT_FUEL, EVENT_LANDED, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
canvas.width = 1280;
canvas.height = 720;
const status = document.getElementById('status');
const world = createWorld();
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

// A small live snapshot for tests and debugging: the current screen and the
// numbers the HUD shows. Updated every frame; never written to disk.
function publishFlight(screen) {
  const p = world.plane;
  window.__flight = {
    screen,
    alt: Math.round(Math.max(0, p.y - 1)),
    spd: Math.round(p.speed * 1.94),
    hdg: Math.round(((p.heading * 180) / Math.PI % 360 + 360) % 360),
    fuel: Math.round(p.fuel),
    score: world.score,
    bank: Number(p.bank.toFixed(3)),
    rings: world.ringIndex,
    time: Math.round(world.time),
  };
}

function runShot(name) {
  const opts = {
    t: Number.parseFloat(params.get('t') ?? ''),
    d: Number.parseFloat(params.get('d') ?? ''),
  };
  const scene = stageShot(name, world, opts);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, nextTarget(world), performance.now() / 1000);
    publishFlight(scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(world);
    accumulator = 0;
    screen = 'play';
    // Cruise power on: the arrows alone must fly the plane, and W/S then
    // trim the throttle up or down from here.
    world.plane.throttle = 0.62;
    audio.ensure();
    audio.click();
    announce('Flying. Six rings, then land on the far strip.');
  }

  function endGame(landed) {
    screen = landed ? 'complete' : 'over';
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    if (landed) audio.land();
    else audio.crash();
    announce(landed ? `Mission complete. Score ${world.score}.` : `Crashed. Score ${world.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'over' || screen === 'complete')) startGame();
    else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      announce('Flying.');
    }
  }

  function step() {
    if (screen === 'title') {
      // Attract mode: the plane sits on the strip, engine off.
      stepWorld(world, { steer: 0, pitch: 0, throttle: 0 });
      return;
    }
    const ctl = input.controls();
    const events = stepWorld(world, ctl);
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${world.ringIndex} of 6. Score ${world.score}.`);
    }
    if (events & EVENT_FUEL) announce('Fuel empty — gliding. Find the strip.');
    if (events & EVENT_LANDED) endGame(true);
    else if (events & EVENT_CRASH) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'title' || screen === 'play') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (screen === 'play') audio.engine(world.plane.throttle, world.plane.speed);
    renderer.draw(world, screen, best, nextTarget(world), now / 1000);
    publishFlight(screen);
  }

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  announce('Canyon Mail. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
