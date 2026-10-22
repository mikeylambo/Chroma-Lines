import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_SPECS } from "../src/content/curveSpec.ts";
import { campaignLevel, dailyLevel, endlessLevel } from "../src/meta/levels.ts";
import { solve } from "../src/sim/solve.ts";
import { serializeBoard } from "../src/sim/board.ts";
import { generate } from "../src/sim/generate.ts";
import { paramsForSpec } from "../src/meta/levels.ts";

test("curve: every campaign level sits inside its band and is solvable", () => {
  for (const spec of LEVEL_SPECS) {
    const { board, score, def } = campaignLevel(spec.level);
    assert.ok(solve(board).solved, `L${spec.level} unsolvable`);
    if (spec.authored) continue;
    assert.ok(score.difficulty >= def.band[0] && score.difficulty <= def.band[1], `L${spec.level} d=${score.difficulty} band=${def.band}`);
  }
});

test("curve: non-decreasing, except breathers (and the L11 aha intro)", () => {
  let prev = -Infinity;
  for (const spec of LEVEL_SPECS) {
    const { def } = campaignLevel(spec.level);
    if (spec.breather || spec.aha) {
      assert.ok(def.band[0] <= prev, `breather L${spec.level} should be easier`);
      continue;
    }
    assert.ok(def.band[0] >= prev, `L${spec.level} band ${def.band[0]} < ${prev}`);
    prev = def.band[0];
  }
});

test("curve: L11 reads as jammed in mono but has a colour pass-through", () => {
  const { score } = campaignLevel(11);
  assert.equal(score.monoFree, 0);
  assert.ok(score.free >= 1 && score.chromaTraps >= 1);
});

test("curve: campaign levels regenerate deterministically from curve.json", () => {
  for (const spec of LEVEL_SPECS.filter((s) => !s.authored)) {
    const a = campaignLevel(spec.level);
    assert.equal(serializeBoard(a.board), serializeBoard(generate(paramsForSpec(spec), a.def.seed)));
  }
});

test("tutorial lock: levels 1-3 match their authored structures", () => {
  const shape = (n: number) => JSON.stringify(campaignLevel(n).board.lines.map((l) => [l.dir, l.cells]));
  assert.equal(shape(1), "[[1,[7,6,5]],[3,[8,9,10]]]");
  assert.equal(shape(2), "[[0,[2,6,10,14]],[1,[5,4]]]");
  assert.equal(shape(3), "[[2,[24,19,14,9]],[1,[13,12,11]],[3,[5,6,7,8]],[2,[22,17,16,15]]]");
  // L1: both free. L2: exactly one blocked. L3: a decoy (head beside the edge, blocked).
  assert.equal(campaignLevel(1).score.free, 2);
  assert.equal(campaignLevel(2).score.free, 1);
  assert.ok(campaignLevel(3).score.decoys >= 1);
});

test("endless and daily boards are solvable and deterministic", () => {
  for (let i = 61; i <= 160; i++) {
    const a = endlessLevel(i);
    assert.ok(solve(a.board).solved, `endless ${i}`);
    assert.equal(serializeBoard(a.board), serializeBoard(endlessLevel(i).board));
  }
  for (let d = 0; d < 120; d++) {
    const date = new Date(Date.UTC(2026, 0, 1 + d));
    const a = dailyLevel(date);
    assert.ok(solve(a.board).solved);
    assert.equal(a.def.key, dailyLevel(date).def.key);
  }
});
