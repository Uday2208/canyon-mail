// Keyboard and mouse, one job: turn what the pilot does into the three
// numbers the flight model reads — steer, pitch and throttle — plus the
// one-shot actions (confirm, pause, pick a mission, drop a parcel).
// Keyboard wins when keys are held; the mouse steers toward where it
// points the rest of the time.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MODE_RINGS = 4;
export const ACTION_MODE_DROP = 8;

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0.5, y: 0.5, active: false };
  let actions = 0;

  function keyName(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Space' || e.code === 'Enter') actions |= ACTION_CONFIRM;
      if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
      if (e.code === 'Digit1' || e.code === 'Numpad1') actions |= ACTION_MODE_RINGS;
      if (e.code === 'Digit2' || e.code === 'Numpad2') actions |= ACTION_MODE_DROP;
    }
    keys.add(keyName(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / Math.max(1, rect.width);
    mouse.y = (e.clientY - rect.top) / Math.max(1, rect.height);
    mouse.active = true;
  });
  canvas.addEventListener('mousedown', () => { actions |= ACTION_CONFIRM; });
  canvas.addEventListener('mouseleave', () => { mouse.active = false; });

  /** The continuous controls for this frame: steer -1..1, pitch -1..1, throttle -1..1. */
  function controls() {
    let steer = 0;
    let pitch = 0;
    let throttle = 0;
    // Arrows / A-D fly the nose: left-right banks, up-down pitches.
    if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    // W/S work the throttle: W = more power, S = less.
    if (keys.has('KeyW')) throttle += 1;
    if (keys.has('KeyS')) throttle -= 1;
    if (steer === 0 && pitch === 0 && mouse.active) {
      steer = Math.max(-1, Math.min(1, (mouse.x - 0.5) * 2.4));
      pitch = Math.max(-1, Math.min(1, (0.5 - mouse.y) * 2.4));
    }
    return { steer, pitch, throttle };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { controls, takeActions };
}
