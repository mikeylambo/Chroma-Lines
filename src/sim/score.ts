import { type Board, BoardState, rayCells, usableCells } from "./board.ts";

export interface BoardScore {
  depth: number;
  branching: number;
  decoys: number;
  chromaTraps: number;
  /** Lines free under the mono reading (ignoring colour). 0 + chroma = a "jammed" aha board. */
  monoFree: number;
  free: number;
  cyclic: boolean;
  difficulty: number;
  /** blockers[b] = lines sitting on b's ray that block it. */
  blockers: number[][];
}

export function scoreBoard(board: Board): BoardScore {
  const state = new BoardState(board);
  const lines = board.lines;
  const blockers: number[][] = lines.map(() => []);
  let decoys = 0, chromaTraps = 0, monoFree = 0, free = 0;

  lines.forEach((line, b) => {
    const ray = rayCells(board, line);
    let sameOnRay = false;
    let anyOnRay = false;
    for (const c of ray) {
      const a = state.owner[c]!;
      if (a < 0 || a === b) continue;
      anyOnRay = true;
      if (board.rule === "mono" || lines[a]!.color !== line.color) {
        if (!blockers[b]!.includes(a)) blockers[b]!.push(a);
      } else sameOnRay = true;
    }
    if (!anyOnRay) monoFree++;
    const blocked = blockers[b]!.length > 0;
    if (!blocked) free++;
    if (blocked && ray.length <= 2) decoys++;
    if (!blocked && sameOnRay && board.rule === "chroma") chromaTraps++;
  });

  // Longest chain through the blocking DAG (a -> b when a blocks b).
  const memo = new Int32Array(lines.length).fill(0);
  const mark = new Uint8Array(lines.length); // 0 new, 1 visiting, 2 done
  let cyclic = false;
  const chain = (b: number): number => {
    if (mark[b] === 2) return memo[b]!;
    if (mark[b] === 1) { cyclic = true; return 0; }
    mark[b] = 1;
    let best = 0;
    for (const a of blockers[b]!) best = Math.max(best, chain(a));
    mark[b] = 2;
    memo[b] = best + 1;
    return best + 1;
  };
  let depth = 0;
  for (let i = 0; i < lines.length; i++) depth = Math.max(depth, chain(i));
  const branching = blockers.reduce((m, list) => Math.max(m, list.length), 0);

  const raw = 1.0 * depth + 0.6 * branching + 0.8 * decoys + 1.2 * chromaTraps;
  const difficulty = raw / Math.pow(Math.max(16, usableCells(board)) / 16, 0.1);
  return { depth, branching, decoys, chromaTraps, monoFree, free, cyclic, difficulty, blockers };
}
