import type { Board, Dir, Line } from "../sim/board.ts";

// Levels 1-3 are authored: they teach tap, blocking and decoys with zero text.
type Spec = { dir: Dir; cells: [number, number][] };
const N = 0, E = 1, S = 2, W = 3;

function board(w: number, h: number, specs: Spec[]): Board {
  const lines: Line[] = specs.map((s, id) => ({ id, color: 0, dir: s.dir, cells: s.cells.map(([x, y]) => y * w + x) }));
  return { w, h, rule: "mono", mask: null, lines };
}

export const TUTORIALS: Record<number, () => Board> = {
  // L1: two straight lines, both free.
  1: () => board(4, 4, [
    { dir: E, cells: [[3, 1], [2, 1], [1, 1]] },
    { dir: W, cells: [[0, 2], [1, 2], [2, 2]] },
  ]),
  // L2: one line blocks another.
  2: () => board(4, 4, [
    { dir: N, cells: [[2, 0], [2, 1], [2, 2], [2, 3]] },
    { dir: E, cells: [[1, 1], [0, 1]] },
  ]),
  // L3: first decoy — a head one cell from the edge that is still blocked.
  3: () => board(5, 5, [
    { dir: S, cells: [[4, 4], [4, 3], [4, 2], [4, 1]] },
    { dir: E, cells: [[3, 2], [2, 2], [1, 2]] },
    { dir: W, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    { dir: S, cells: [[2, 4], [2, 3], [1, 3], [0, 3]] },
  ]),
};
