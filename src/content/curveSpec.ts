import type { MaskName } from "./masks.ts";
import type { Rule } from "../sim/board.ts";

// Authoring source for the campaign. tools/build-curve.ts turns this into curve.json
// (difficulty bands + the fixed seeds every player gets).

export interface LevelSpec {
  level: number; // 1-based
  chapter: number; // 1..6
  w: number;
  h: number;
  rule: Rule;
  colors: number;
  mask: MaskName | null;
  minLen: number;
  maxLen: number;
  density: number;
  trapBias: number;
  depthBias: number;
  breather: boolean;
  authored: boolean;
  /** L11: every line looks blocked until colour is read. */
  aha?: boolean;
  /** Within-chapter ramp 0..1, drives the target difficulty quantile. */
  ramp: number;
}

export const CHAPTERS = [
  { id: 1, name: "First Light" },
  { id: 2, name: "Chroma" },
  { id: 3, name: "Silhouettes" },
  { id: 4, name: "Tri" },
  { id: 5, name: "Long Light" },
  { id: 6, name: "Prism" },
] as const;

type Row = [size: number, minLen: number, maxLen: number, mask?: MaskName];
const ch: Record<number, { rule: Rule; colors: number; density: number; trapBias: number; depthBias: number; rows: Row[] }> = {
  1: { rule: "mono", colors: 1, density: 0.88, trapBias: 0, depthBias: 1, rows: [[4, 2, 3], [4, 2, 4], [5, 2, 4], [5, 2, 4], [5, 2, 4], [6, 2, 5], [7, 2, 5], [7, 2, 6], [8, 2, 6], [9, 3, 6]] },
  2: { rule: "chroma", colors: 2, density: 0.9, trapBias: 0, depthBias: 2, rows: [[6, 2, 5], [7, 2, 5], [8, 2, 6], [8, 3, 6], [8, 3, 6], [9, 3, 6], [9, 3, 7], [10, 3, 7], [10, 3, 7], [10, 3, 7]] },
  3: { rule: "chroma", colors: 2, density: 0.92, trapBias: 0.1, depthBias: 3, rows: [[13, 2, 6, "star"], [12, 2, 6, "heart"], [12, 2, 7, "crown"], [16, 2, 7, "bolt"], [13, 2, 6, "sigil"], [13, 3, 7, "heart"], [14, 3, 8, "star"], [13, 3, 8, "crown"], [15, 3, 8, "diamond"], [15, 3, 7, "sigil"]] },
  4: { rule: "chroma", colors: 3, density: 0.9, trapBias: 1.4, depthBias: 3, rows: [[10, 3, 7], [10, 3, 8], [11, 3, 8], [11, 4, 8], [11, 3, 8], [11, 4, 9], [12, 4, 9], [12, 4, 10], [12, 4, 10], [12, 4, 10]] },
  5: { rule: "chroma", colors: 3, density: 0.9, trapBias: 1.2, depthBias: 5, rows: [[12, 5, 12], [12, 5, 12], [13, 6, 13], [13, 6, 14], [13, 6, 12], [13, 7, 14], [14, 7, 15], [14, 8, 16], [14, 8, 16], [14, 8, 16]] },
  6: { rule: "chroma", colors: 3, density: 0.9, trapBias: 1.6, depthBias: 6, rows: [[15, 4, 12, "diamond"], [14, 4, 12, "hex"], [16, 4, 13, "moon"], [16, 5, 14, "star"], [15, 4, 12, "ring"], [16, 6, 14, "heart"], [15, 6, 15, "crown"], [16, 6, 16, "hex"], [16, 8, 17, "sigil"], [16, 6, 14, "diamond"]] },
};

export const LEVEL_SPECS: LevelSpec[] = Object.entries(ch).flatMap(([cid, c]) =>
  c.rows.map(([size, minLen, maxLen, mask], i): LevelSpec => {
    const level = (Number(cid) - 1) * 10 + i + 1;
    return {
      level,
      chapter: Number(cid),
      w: size,
      h: size,
      rule: c.rule,
      colors: c.colors,
      mask: mask ?? null,
      minLen,
      maxLen,
      density: level === 11 ? 0.85 : c.density,
      trapBias: level === 11 ? 5 : c.trapBias,
      depthBias: c.depthBias,
      breather: level % 5 === 0,
      authored: level <= 3,
      aha: level === 11,
      ramp: i / 9,
    };
  }),
);

export const CAMPAIGN_LENGTH = LEVEL_SPECS.length;
