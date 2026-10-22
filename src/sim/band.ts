import type { Board } from "./board.ts";
import { generate, subSeed, type GenParams } from "./generate.ts";
import { type BoardScore, scoreBoard } from "./score.ts";

export type Band = [lo: number, hi: number];

export interface BandResult {
  board: Board;
  score: BoardScore;
  seed: number;
  attempts: number;
  inBand: boolean;
}

/** Regenerates on successive seed sub-streams until the difficulty lands in band. */
export function generateInBand(
  params: GenParams,
  seed: number,
  band: Band,
  maxTries = 64,
  accept: (score: BoardScore, board: Board) => boolean = () => true,
): BandResult {
  let best: BandResult | null = null;
  let bestGap = Infinity;
  for (let k = 0; k < maxTries; k++) {
    const s = k === 0 ? seed >>> 0 : subSeed(seed, k);
    const board = generate(params, s);
    const score = scoreBoard(board);
    const ok = accept(score, board);
    const d = score.difficulty;
    if (ok && d >= band[0] && d <= band[1]) return { board, score, seed: s, attempts: k + 1, inBand: true };
    const gap = (ok ? 0 : 1000) + (d < band[0] ? band[0] - d : d - band[1]);
    if (gap < bestGap) { bestGap = gap; best = { board, score, seed: s, attempts: k + 1, inBand: false }; }
  }
  return best!;
}
