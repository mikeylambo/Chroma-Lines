import { scheduledSeed, stableHashString } from "@slu/web-shell";
import curve from "../content/curve.json" with { type: "json" };
import { buildMask, MASK_NAMES, type MaskName } from "../content/masks.ts";
import { CAMPAIGN_LENGTH, LEVEL_SPECS, type LevelSpec } from "../content/curveSpec.ts";
import { TUTORIALS } from "../content/tutorials.ts";
import type { Board } from "../sim/board.ts";
import { type Band, generateInBand } from "../sim/band.ts";
import { generate, subSeed, type GenParams } from "../sim/generate.ts";
import { type BoardScore, scoreBoard } from "../sim/score.ts";

export type LevelKind = "campaign" | "endless" | "daily";

export interface LevelDef {
  kind: LevelKind;
  /** Campaign: 1..60. Endless: 61+. Daily: 0. */
  index: number;
  chapter: number;
  seed: number;
  band: Band;
  breather: boolean;
  mask: MaskName | null;
  key: string; // daily key / campaign id
}

export interface LoadedLevel {
  def: LevelDef;
  board: Board;
  score: BoardScore;
}

interface CurveRow { level: number; seed: number; band: Band; difficulty: number }
const rows = (curve as { levels: CurveRow[] }).levels;

export function paramsForSpec(spec: LevelSpec): GenParams {
  return {
    w: spec.w,
    h: spec.h,
    rule: spec.rule,
    colors: spec.colors,
    mask: spec.mask ? buildMask(spec.mask, spec.w, spec.h) : null,
    minLen: spec.minLen,
    maxLen: spec.maxLen,
    density: spec.density,
    trapBias: spec.trapBias,
    depthBias: spec.depthBias,
  };
}

export function campaignLevel(level: number): LoadedLevel {
  const spec = LEVEL_SPECS[level - 1]!;
  const row = rows[level - 1]!;
  const board = spec.authored ? TUTORIALS[level]!() : generate(paramsForSpec(spec), row.seed);
  const def: LevelDef = { kind: "campaign", index: level, chapter: spec.chapter, seed: row.seed, band: row.band, breather: spec.breather, mask: spec.mask, key: `L${level}` };
  return { def, board, score: scoreBoard(board) };
}

/** Endless: a band that climbs slowly from the end of the campaign, cycling sizes and silhouettes. */
export function endlessLevel(index: number): LoadedLevel {
  const n = index - CAMPAIGN_LENGTH; // 1..
  const seed = stableHashString(`chroma-lines:endless:${n}`);
  const last = rows[CAMPAIGN_LENGTH - 1]!.band;
  const breather = n % 5 === 0;
  const lo = last[0] + Math.min(4, n * 0.04) - (breather ? 1.4 : 0);
  const band: Band = [lo, lo + 1.8];
  const size = 12 + ((n * 7) % 5);
  const masked = n % 3 === 0;
  const mask = masked ? MASK_NAMES[(n / 3) % MASK_NAMES.length | 0]! : null;
  const params: GenParams = {
    w: size, h: size, rule: "chroma", colors: 3,
    mask: mask ? buildMask(mask, size, size) : null,
    minLen: 5, maxLen: 10 + (n % 7), density: 0.9, trapBias: 1.6, depthBias: 3.5,
  };
  const r = generateInBand(params, seed, band, 48);
  return { def: { kind: "endless", index, chapter: 7, seed: r.seed, band, breather, mask, key: `E${n}` }, board: r.board, score: r.score };
}

/** Daily Light: one shared board per UTC day. */
export function dailyLevel(date = new Date()): LoadedLevel {
  const sched = scheduledSeed("chroma-lines", "daily", date);
  const day = sched.seed;
  const size = 10 + (day % 4);
  const mask = day % 2 === 0 ? MASK_NAMES[(day >>> 3) % MASK_NAMES.length]! : null;
  const params: GenParams = {
    w: size, h: size, rule: "chroma", colors: 3,
    mask: mask ? buildMask(mask, size, size) : null,
    minLen: 4, maxLen: 10, density: 0.9, trapBias: 1.4, depthBias: 2.5,
  };
  const band: Band = [7, 9.5];
  const r = generateInBand(params, subSeed(day, "daily"), band, 48);
  return { def: { kind: "daily", index: 0, chapter: 0, seed: r.seed, band, breather: false, mask, key: sched.key }, board: r.board, score: r.score };
}

export function loadLevel(kind: LevelKind, index: number): LoadedLevel {
  if (kind === "daily") return dailyLevel();
  if (index > CAMPAIGN_LENGTH) return endlessLevel(index);
  return campaignLevel(index);
}
