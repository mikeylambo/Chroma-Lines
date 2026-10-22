import { type Board, BoardState } from "./board.ts";

export interface SolveResult {
  solved: boolean;
  order: number[];
}

/** Greedy removal. Removal never blocks another line, so greedy is complete. */
export function solve(board: Board | BoardState): SolveResult {
  const state = board instanceof BoardState ? board.clone() : new BoardState(board);
  const order: number[] = [];
  let progress = true;
  while (state.remaining > 0 && progress) {
    progress = false;
    for (let i = 0; i < state.alive.length; i++) {
      if (state.alive[i] && state.firstBlocker(i) < 0) {
        state.remove(i);
        order.push(i);
        progress = true;
      }
    }
  }
  return { solved: state.remaining === 0, order };
}

/** The free line whose removal frees the most others (hint target). -1 if none. */
export function criticalMove(state: BoardState): number {
  const free = state.freeLines();
  if (free.length === 0) return -1;
  const before = new Set(free);
  let best = free[0]!, bestGain = -1;
  for (const i of free) {
    const next = state.clone();
    next.remove(i);
    let gain = 0;
    for (const j of next.freeLines()) if (!before.has(j)) gain++;
    // Tie-break toward longer lines: they open the most space visually.
    const score = gain * 100 + state.board.lines[i]!.cells.length;
    if (score > bestGain) { bestGain = score; best = i; }
  }
  return best;
}
