// Token Launch Radar — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot (/input/snapshot.json in the grader, or --input <file|dir> locally),
// builds the ranked board with lib/model.ts, and writes the hand-in to the output directory
// (MAKEFUN_OUTPUT_DIR locally, /output in the grader):
//   board.json    the ranked board the gate checks
//   data.js       the same radar as one script the static dashboard reads
//   dashboard/    the page itself, copied from this repository
//   screenshots/  the three hand-in images, copied from this repository
//   dossier.json  written last, with the vendored buildDossier, byte for byte what the scorer
//                 rebuilds from the same output
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.rows, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the board fails the gate's shape: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFlat(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFlat(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images, the hand-in needs 3\n`);
  process.exit(1);
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} watchlist, ${radar.rows.length} pre-token rows ranked, top: ${radar.rows[0]!.name} at $${radar.rows[0]!.implied_value_usd.toLocaleString('en-US')}\n`,
);
