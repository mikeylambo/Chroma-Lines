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
const rows = (curve as unknown as { levels: CurveRow[] }).levels;

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

/** Rotating profiles: every few boards the rule, palette and silhouette change. */
export type Profile = "mono" | "duo" | "tri" | "silhouette" | "long" | "prism" | "grand";
const PROFILE_PARAMS: Record<Profile, { colors: number; mask: boolean; min: number; max: number; trap: number; depth: number }> = {
  mono: { colors: 1, mask: false, min: 2, max: 7, trap: 0, depth: 2 },
  duo: { colors: 2, mask: false, min: 3, max: 8, trap: 0.4, depth: 3 },
  tri: { colors: 3, mask: false, min: 3, max: 10, trap: 1.4, depth: 3 },
  silhouette: { colors: 2, mask: true, min: 2, max: 8, trap: 0.4, depth: 3 },
  long: { colors: 3, mask: false, min: 7, max: 16, trap: 1.2, depth: 5 },
  prism: { colors: 3, mask: true, min: 4, max: 14, trap: 1.6, depth: 6 },
  grand: { colors: 3, mask: false, min: 5, max: 18, trap: 1.6, depth: 6 },
};

function profileParams(profile: Profile, size: number, maskPick: number): { params: GenParams; mask: MaskName | null } {
  const p = PROFILE_PARAMS[profile];
  const mask = p.mask ? MASK_NAMES[maskPick % MASK_NAMES.length]! : null;
  return {
    mask,
    params: {
      w: size, h: size, rule: p.colors === 1 ? "mono" : "chroma", colors: p.colors,
      mask: mask ? buildMask(mask, size, size) : null,
      minLen: p.min, maxLen: p.max, density: 0.9, trapBias: p.trap, depthBias: p.depth,
    },
  };
}

/**
 * Endless run board n (1-based) for a run seed. Difficulty climbs without a cap (log curve);
 * every 5th board is a breather; profiles rotate so runs stay varied.
 */
export function endlessBoard(runSeed: number, n: number): LoadedLevel {
  const seed = stableHashString(`chroma-lines:run:${runSeed >>> 0}:${n}`);
  const cycle: Profile[] = ["tri", "duo", "tri", "silhouette", "tri", "long", "mono", "tri", "prism", "duo", "long", "grand"];
  const profile = cycle[(n - 1 + (runSeed % cycle.length)) % cycle.length]!;
  const breather = n % 5 === 0;
  const size = Math.min(16, 8 + Math.floor(n / 2) + (PROFILE_PARAMS[profile].mask ? 3 : 0)) - (breather ? 2 : 0);
  const { params, mask } = profileParams(profile, Math.max(7, size), seed >>> 5);
  const climb = 9 + 3.4 * Math.log2(1 + n / 3) - (breather ? 2.5 : 0);
  const lo = profile === "mono" ? climb * 0.62 : climb;
  const band: Band = [lo, lo + 2.2];
  const r = generateInBand(params, seed, band, 40);
  return { def: { kind: "endless", index: n, chapter: 7, seed: r.seed, band, breather, mask, key: `R${runSeed >>> 0}:${n}` }, board: r.board, score: r.score };
}

/** Daily Light: one shared board per UTC day; the weekday picks the flavour. */
const DAILY_WEEK: Profile[] = ["grand", "mono", "duo", "silhouette", "tri", "long", "prism"]; // Sun..Sat
export function dailyProfile(date = new Date()): Profile { return DAILY_WEEK[date.getUTCDay()]!; }
export function dailyLevel(date = new Date()): LoadedLevel {
  const sched = scheduledSeed("chroma-lines", "daily", date);
  const day = sched.seed;
  const profile = dailyProfile(date);
  const size = profile === "grand" ? 16 : profile === "prism" || profile === "silhouette" ? 14 : profile === "mono" ? 10 : 12;
  const { params, mask } = profileParams(profile, size, day >>> 3);
  const lo = profile === "mono" ? 8 : 14;
  const band: Band = [lo, lo + 3];
  const r = generateInBand(params, subSeed(day, "daily"), band, 48);
  return { def: { kind: "daily", index: 0, chapter: 0, seed: r.seed, band, breather: false, mask, key: sched.key }, board: r.board, score: r.score };
}

/** Points for an endless board: lines × run depth, perfect ×1.5, plus a bonus per pass-through clear. */
export function endlessPoints(board: Board, n: number, mistakes: number, passes = 0): number {
  const depth = 1 + (n - 1) * 0.08;
  const base = board.lines.length * 10 * depth;
  return Math.round(base * (mistakes === 0 ? 1.5 : 1) + passes * 25 * depth);
}

export function loadLevel(kind: LevelKind, index: number): LoadedLevel {
  if (kind === "daily") return dailyLevel();
  return campaignLevel(Math.min(index, CAMPAIGN_LENGTH));
}
