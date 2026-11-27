# Canyon Mail

A flight game: you are the mail pilot of a desert canyon. Take off from the
home strip, thread six glowing rings down the valley, watch the fuel — every
ring buys 12% back — then put the plane down gently on the far strip. A
hard touchdown, a canyon wall, or an empty tank ends the sortie.

## How to fly

- **Arrows** fly the nose: Left/Right bank, Up/Down pitch.
- **W / S** work the throttle: W more power, S less.
- **Mouse** steers too: point where you want to go.
- **Space** or click starts, **P** pauses.

Climbing bleeds speed, diving gains it, and below stall speed the nose drops
on its own. Land slow, level, and on the asphalt: under 42 kt with a gentle
descent and wings level.

## What is in the game

- Chase view over a procedural desert canyon: valley floor, winding river,
  flat-topped mesas, canyon walls, two runways, sun and drifting clouds.
- The mail plane in frame with lit instruments: attitude indicator, airspeed
  and altimeter dials, compass tape, fuel and throttle bars, plus a HUD with
  altitude, speed, heading, score, rings and the next target's distance,
  bearing — and its altitude, with a climb/descend cue, so a pilot can line
  up the ring in height as well as in heading.
- Six rings with different heights and positions, fuel and damage as the
  decisions, a timer, and a score with a time bonus for a quick delivery.
- Synthesized sound only (WebAudio): engine hum, ring chime, crash, landing
  arpeggio. No audio files, no network requests, nothing fetched at all.

## Run it

```
node serve.ts        # serves game/ on http://localhost:8080
```

Open the page in desktop Chrome. `?shot=start|play|ring|end&seed=1` stages
a screenshot scene instead of the live game (the same deterministic
autopilot flies each one). Screenshots live in `screenshots/`; the first by
name is the cover.

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's vendored `vendor/makefun-game.ts`.

## Files

- `game/index.html` — the page: one canvas, one module script.
- `game/src/config.js` — every tuning number in one place.
- `game/src/random.js` — seeded RNG and value noise (deterministic world).
- `game/src/terrain.js` — the canyon: heights, river, mesas, runways, rings.
- `game/src/plane.js` — the flight model.
- `game/src/world.js` — rings, score, landings, crashes, fuel.
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesized WebAudio sounds.
- `game/src/render.js` — the chase camera, terrain, plane, instruments, HUD.
- `game/src/shots.js` — the autopilot that stages the screenshot scenes.
- `game/src/main.js` — boot, fixed-step loop, screens.
- `main.ts` — the hand-in program. `serve.ts` — a dev static server.
