import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BoardState, serializeBoard } from "../src/sim/board.ts";
import { generate, type GenParams } from "../src/sim/generate.ts";
import { scoreBoard } from "../src/sim/score.ts";
import { criticalMove, solve } from "../src/sim/solve.ts";
import { buildMask } from "../src/content/masks.ts";

const SEEDS = Number(process.env.SOLVE_SEEDS ?? 10000);

// Representative bands: smallest early board → largest late board, plain and silhouetted.
const BANDS: Record<string, Omit<GenParams, "rule" | "colors">> = {
  early: { w: 5, h: 5, minLen: 2, maxLen: 4, density: 0.88, depthBias: 1 },
  mid: { w: 10, h: 10, minLen: 3, maxLen: 7, density: 0.9, depthBias: 2 },
  late: { w: 14, h: 14, minLen: 8, maxLen: 16, density: 0.9, depthBias: 5, trapBias: 1.2 },
  silhouette: { w: 16, h: 16, minLen: 6, maxLen: 16, density: 0.9, depthBias: 6, trapBias: 1.6, mask: buildMask("sigil", 16, 16) },
};
const RULES = [
  { rule: "mono", colors: 1 },
  { rule: "chroma", colors: 3 },
] as const;

for (const [name, band] of Object.entries(BANDS)) {
  for (const r of RULES) {
    test(`solvability: ${SEEDS} seeds × ${name} × ${r.rule} — 100% solvable, 0 cycles`, () => {
      let unsolved = 0, cycles = 0;
      for (let s = 1; s <= SEEDS; s++) {
        const board = generate({ ...band, ...r }, s);
        if (!solve(board).solved) unsolved++;
        if (scoreBoard(board).cyclic) cycles++;
      }
      assert.equal(unsolved, 0);
      assert.equal(cycles, 0);
    });
  }
}

test("generator never puts a tail on its own ray, never overlaps, respects the mask", () => {
  const mask = buildMask("heart", 12, 12);
  for (let s = 1; s <= 500; s++) {
    const b = generate({ w: 12, h: 12, rule: "chroma", colors: 3, minLen: 3, maxLen: 12, density: 0.9, mask }, s);
    const seen = new Set<number>();
    for (const line of b.lines) {
      const hx = line.cells[0]! % 12, hy = (line.cells[0]! / 12) | 0;
      for (const c of line.cells) {
        assert.ok(!seen.has(c), "overlap");
        seen.add(c);
        assert.equal(mask[c], 0, "void cell used");
      }
      for (const c of line.cells.slice(1)) {
        const x = c % 12, y = (c / 12) | 0;
        const onRay = [y < hy && x === hx, x > hx && y === hy, y > hy && x === hx, x < hx && y === hy][line.dir];
        assert.ok(!onRay, "tail on own ray");
      }
      for (let i = 1; i < line.cells.length; i++) {
        const a = line.cells[i - 1]!, c = line.cells[i]!;
        assert.equal(Math.abs((a % 12) - (c % 12)) + Math.abs(((a / 12) | 0) - ((c / 12) | 0)), 1, "tail not contiguous");
      }
    }
  }
});

test("determinism: same seed + params → byte-identical board", () => {
  const p: GenParams = { w: 13, h: 13, rule: "chroma", colors: 3, minLen: 4, maxLen: 14, density: 0.9, mask: buildMask("crown", 13, 13), depthBias: 4, trapBias: 1.4 };
  for (const seed of [1, 42, 0xdeadbeef, 123456789]) {
    assert.equal(serializeBoard(generate(p, seed)), serializeBoard(generate(p, seed)));
  }
  assert.notEqual(serializeBoard(generate(p, 1)), serializeBoard(generate(p, 2)));
});

test("generator speed: p95 under 50 ms for the largest band", () => {
  const p: GenParams = { w: 16, h: 16, rule: "chroma", colors: 3, minLen: 8, maxLen: 18, density: 0.9, depthBias: 6, trapBias: 1.6 };
  const times: number[] = [];
  for (let s = 1; s <= 400; s++) {
    const t = performance.now();
    generate(p, s);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)]!;
  console.log(`  generator p95 = ${p95.toFixed(2)} ms (16×16, 3 colours)`);
  assert.ok(p95 < 50, `p95 ${p95} ms`);
});

// Chroma correctness on hand-built boards.
const at = (w: number, x: number, y: number) => y * w + x;
function hand(rule: "mono" | "chroma", lines: Board["lines"]): Board {
  return { w: 5, h: 5, rule, mask: null, lines };
}

test("chroma: a same-colour line on the ray is passed through, never reported blocked", () => {
  const b = hand("chroma", [
    { id: 0, color: 1, dir: 1, cells: [at(5, 0, 2)] },
    { id: 1, color: 1, dir: 0, cells: [at(5, 2, 0), at(5, 2, 1), at(5, 2, 2), at(5, 2, 3)] },
  ]);
  const st = new BoardState(b);
  assert.equal(st.firstBlocker(0), -1);
  assert.ok(st.isFree(0));
  assert.deepEqual(st.passThrough(0), [1]);
  assert.equal(scoreBoard(b).chromaTraps, 1);
  assert.equal(scoreBoard(b).monoFree, 1); // line 1 is free regardless; line 0 only via colour
});

test("chroma: a different-colour blocker is always reported", () => {
  const b = hand("chroma", [
    { id: 0, color: 0, dir: 1, cells: [at(5, 0, 2)] },
    { id: 1, color: 1, dir: 0, cells: [at(5, 2, 0), at(5, 2, 1), at(5, 2, 2)] },
    { id: 2, color: 0, dir: 0, cells: [at(5, 4, 1), at(5, 4, 2)] },
  ]);
  const st = new BoardState(b);
  assert.equal(st.firstBlocker(0), 1);
  assert.ok(!st.isFree(0));
  st.remove(1);
  assert.equal(st.firstBlocker(0), -1, "same-colour line 2 further along still passes");
});

test("mono: any line on the ray blocks", () => {
  const b = hand("mono", [
    { id: 0, color: 0, dir: 1, cells: [at(5, 0, 2)] },
    { id: 1, color: 0, dir: 0, cells: [at(5, 2, 0), at(5, 2, 1), at(5, 2, 2)] },
  ]);
  assert.equal(new BoardState(b).firstBlocker(0), 1);
});

test("solver critical move is free and unlocks the most lines", () => {
  for (let s = 1; s <= 200; s++) {
    const b = generate({ w: 9, h: 9, rule: "chroma", colors: 2, minLen: 2, maxLen: 6, density: 0.9 }, s);
    const st = new BoardState(b);
    const m = criticalMove(st);
    assert.ok(m >= 0 && st.isFree(m));
  }
});
