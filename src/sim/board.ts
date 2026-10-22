// Pure board rules. No rendering, no DOM — shared by the game, generator, solver and tests.

export type Dir = 0 | 1 | 2 | 3; // N E S W
export type Rule = "mono" | "chroma";

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export interface Line {
  id: number;
  color: number;
  /** Cell indices (y * w + x). cells[0] is the head. */
  cells: number[];
  dir: Dir;
}

export interface Board {
  w: number;
  h: number;
  rule: Rule;
  /** 1 = void (off-board). Null = full rectangle. */
  mask: Uint8Array | null;
  lines: Line[];
}

/** Mutable play state for a board: which lines remain and who owns each cell. */
export class BoardState {
  readonly board: Board;
  readonly owner: Int32Array; // line index or -1
  readonly alive: boolean[];
  remaining: number;

  constructor(board: Board) {
    this.board = board;
    this.owner = new Int32Array(board.w * board.h).fill(-1);
    this.alive = board.lines.map(() => true);
    this.remaining = board.lines.length;
    board.lines.forEach((line, i) => {
      for (const c of line.cells) this.owner[c] = i;
    });
  }

  clone(): BoardState {
    const s = Object.create(BoardState.prototype) as BoardState;
    (s as { board: Board }).board = this.board;
    (s as { owner: Int32Array }).owner = this.owner.slice();
    (s as { alive: boolean[] }).alive = this.alive.slice();
    s.remaining = this.remaining;
    return s;
  }

  /** First line index blocking `index`, or -1 if it is free. */
  firstBlocker(index: number): number {
    const { board, owner } = this;
    const line = board.lines[index]!;
    const mono = board.rule === "mono";
    let x = line.cells[0]! % board.w;
    let y = (line.cells[0]! / board.w) | 0;
    for (;;) {
      x += DX[line.dir];
      y += DY[line.dir];
      if (x < 0 || y < 0 || x >= board.w || y >= board.h) return -1;
      const o = owner[y * board.w + x]!;
      if (o >= 0 && o !== index && (mono || board.lines[o]!.color !== line.color)) return o;
    }
  }

  isFree(index: number): boolean {
    return this.alive[index]! && this.firstBlocker(index) < 0;
  }

  /** Same-colour lines this line passes through on its way out (chroma flare targets). */
  passThrough(index: number): number[] {
    const { board, owner } = this;
    const line = board.lines[index]!;
    const out: number[] = [];
    for (const c of rayCells(board, line)) {
      const o = owner[c]!;
      if (o >= 0 && o !== index && !out.includes(o)) out.push(o);
    }
    return out;
  }

  remove(index: number): void {
    if (!this.alive[index]) return;
    this.alive[index] = false;
    this.remaining--;
    for (const c of this.board.lines[index]!.cells) if (this.owner[c] === index) this.owner[c] = -1;
  }

  freeLines(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.alive.length; i++) if (this.alive[i] && this.firstBlocker(i) < 0) out.push(i);
    return out;
  }
}

export function rayCells(board: Board, line: Line): number[] {
  const out: number[] = [];
  let x = line.cells[0]! % board.w;
  let y = (line.cells[0]! / board.w) | 0;
  for (;;) {
    x += DX[line.dir];
    y += DY[line.dir];
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return out;
    out.push(y * board.w + x);
  }
}

export function usableCells(board: Pick<Board, "w" | "h" | "mask">): number {
  if (!board.mask) return board.w * board.h;
  let n = 0;
  for (const v of board.mask) if (!v) n++;
  return n;
}

/** Stable serialisation (determinism tests, debug overlay). */
export function serializeBoard(board: Board): string {
  const mask = board.mask ? Array.from(board.mask).join("") : "";
  const lines = board.lines.map((l) => `${l.id}:${l.color}:${l.dir}:${l.cells.join(",")}`).join("|");
  return `${board.w}x${board.h}/${board.rule}/${mask}/${lines}`;
}
