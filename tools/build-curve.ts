// Builds src/content/curve.json: per-level difficulty band + fixed seed.
import { writeFileSync } from "node:fs";
import { stableHashString } from "@slu/web-shell";
import { LEVEL_SPECS } from "../src/content/curveSpec.ts";
import { paramsForSpec } from "../src/meta/levels.ts";
import { generateInBand } from "../src/sim/band.ts";
import { generate, subSeed } from "../src/sim/generate.ts";
import { scoreBoard } from "../src/sim/score.ts";
import { TUTORIALS } from "../src/content/tutorials.ts";

const WIDTH = 1.4;
const out: unknown[] = [];
let prevLo = 0;
let failures = 0;
for (const spec of LEVEL_SPECS) {
  if (spec.authored) {
    const d = scoreBoard(TUTORIALS[spec.level]!()).difficulty;
    const band: [number, number] = [Math.max(prevLo, Math.floor(d * 10) / 10), Math.max(prevLo, Math.floor(d * 10) / 10) + WIDTH];
    prevLo = band[0];
    out.push({ level: spec.level, seed: 0, band, difficulty: +d.toFixed(3) });
    continue;
  }
  const params = paramsForSpec(spec);
  const base = stableHashString(`chroma-lines:L${spec.level}`);
  const samples: number[] = [];
  for (let k = 0; k < 120; k++) samples.push(scoreBoard(generate(params, subSeed(base, 1000 + k))).difficulty);
  samples.sort((a, b) => a - b);
  const q = samples[Math.floor((0.3 + 0.45 * spec.ramp) * (samples.length - 1))]!;
  let band: [number, number];
  if (spec.aha) {
    // Teaching board: exempt from the curve; any jammed-looking board in a broad easy band.
    band = [+Math.max(prevLo, samples[0]!).toFixed(2), +(samples[Math.floor(samples.length * 0.6)]! + 1).toFixed(2)];
  } else if (spec.breather) {
    const lo = Math.max(0, Math.min(prevLo - WIDTH, samples[Math.floor(samples.length * 0.2)]!));
    band = [+lo.toFixed(2), +(prevLo + (spec.aha ? WIDTH : 0.2)).toFixed(2)];
  } else {
    const lo = Math.max(prevLo, q);
    band = [+lo.toFixed(2), +(lo + WIDTH).toFixed(2)];
  }
  const accept = spec.aha ? (s: ReturnType<typeof scoreBoard>) => s.monoFree === 0 && s.free <= 4 && s.chromaTraps >= 1 : undefined;
  const r = generateInBand(params, base, band, 6000, accept);
  if (!r.inBand) { failures++; console.error(`L${spec.level} miss: band ${band} got ${r.score.difficulty.toFixed(2)} (q=${q.toFixed(2)})`); }
  if (!spec.breather && !spec.aha) prevLo = band[0];
  out.push({ level: spec.level, seed: r.seed, band, difficulty: +r.score.difficulty.toFixed(3) });
  console.log(`L${spec.level} ${spec.w}x${spec.h} ${spec.rule}/${spec.colors}${spec.mask ? " " + spec.mask : ""} band ${band[0]}-${band[1]} d=${r.score.difficulty.toFixed(2)} depth=${r.score.depth} lines=${r.board.lines.length} tries=${r.attempts}${spec.breather ? " (breather)" : ""}`);
}
writeFileSync(new URL("../src/content/curve.json", import.meta.url), JSON.stringify({ version: 1, levels: out }, null, 1) + "\n");
if (failures) { console.error(`${failures} level(s) missed their band`); process.exit(1); }
