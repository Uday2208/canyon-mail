// Canyon Mail — the hand-in program (Node 22, standard library only).
// The game itself is the static files under game/ plus the screenshots/ the
// maker took of it. This program copies both into the output directory and
// writes dossier.json there, using the kit's vendored library so the judge
// reads exactly what the game contains. It never touches the network and it
// never edits a file: same inputs, same outputs, every run.
//
// Play it first with `node serve.ts`, then open http://localhost:8080.
// Hand it in with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps, mirrored here so a bad hand-in fails loudly at home
// instead of quietly on the server: 4 screenshots at most, each at most
// 256 KiB; game/ at most 993 files and 48 MiB; no path under game/ over
// 1000 bytes; the dossier text at most 160 KiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`Canyon Mail handed in: ${out}`);
