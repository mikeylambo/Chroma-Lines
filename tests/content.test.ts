import { test } from "node:test";
import assert from "node:assert/strict";
import { AHA_LEVEL, LEVEL_SPECS } from "../src/content/curveSpec.ts";
import { campaignLevel, dailyLevel, endlessBoard, endlessPoints } from "../src/meta/levels.ts";
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

test("curve: non-decreasing, except breathers (and the aha intro)", () => {
  let prev = -Infinity;
  for (const spec of LEVEL_SPECS) {
    const { def } = campaignLevel(spec.level);
    if (spec.aha) continue; // teaching board, deliberately outside the curve
    if (spec.breather) {
      assert.ok(def.band[0] <= prev, `breather L${spec.level} should be easier`);
      continue;
    }
    assert.ok(def.band[0] >= prev, `L${spec.level} band ${def.band[0]} < ${prev}`);
    prev = def.band[0];
  }
});

test("curve: the aha level reads as jammed in mono but has a colour pass-through", () => {
  const { score } = campaignLevel(AHA_LEVEL);
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
  for (const run of [1, 777, 0xfeedbeef]) {
    for (let n = 1; n <= 60; n++) {
      const a = endlessBoard(run, n);
      assert.ok(solve(a.board).solved, `run ${run} board ${n}`);
      assert.equal(serializeBoard(a.board), serializeBoard(endlessBoard(run, n).board));
    }
  }
  // Deep runs stay solvable and generation stays fast.
  for (const n of [100, 250, 1000]) {
    const t = performance.now();
    assert.ok(solve(endlessBoard(42, n).board).solved);
    assert.ok(performance.now() - t < 500);
  }
  for (let d = 0; d < 120; d++) {
    const date = new Date(Date.UTC(2026, 0, 1 + d));
    const a = dailyLevel(date);
    assert.ok(solve(a.board).solved);
    assert.equal(a.def.key, dailyLevel(date).def.key);
  }
});

test("endless: difficulty climbs (breathers aside) and perfect boards score more", () => {
  const lo = (n: number) => endlessBoard(9, n).def.band[0];
  assert.ok(lo(40) > lo(4) && lo(400) > lo(40));
  const b = endlessBoard(9, 3).board;
  assert.ok(endlessPoints(b, 3, 0) > endlessPoints(b, 3, 1));
  assert.ok(endlessPoints(b, 30, 1) > endlessPoints(b, 3, 1));
});

test("daily: weekday profiles all generate solvable boards", () => {
  for (let d = 0; d < 14; d++) assert.ok(solve(dailyLevel(new Date(Date.UTC(2026, 9, 18 + d))).board).solved);
});

test("colour arrives right after the three mono tutorials", () => {
  assert.equal(AHA_LEVEL, 4);
  for (const l of [1, 2, 3]) assert.equal(campaignLevel(l).board.rule, "mono");
  for (let l = 4; l <= 10; l++) assert.equal(campaignLevel(l).board.rule, "chroma");
});

test("endless: pass-through clears earn a bonus", () => {
  const b = endlessBoard(9, 3).board;
  assert.ok(endlessPoints(b, 3, 0, 2) > endlessPoints(b, 3, 0, 0));
});
