import { type Board, BoardState } from "./board.ts";

export const MAX_LIVES = 3;

export type TapResult =
  | { kind: "free"; line: number; passThrough: number[]; won: boolean }
  | { kind: "blocked"; line: number; blocker: number; lives: number; failed: boolean }
  | { kind: "ignored" };

/** One attempt at a board: lives, mistakes and win/fail. Pure, deterministic. */
export class PlaySession {
  readonly state: BoardState;
  lives = MAX_LIVES;
  mistakes = 0;
  clears = 0;
  over: "won" | "failed" | null = null;

  constructor(readonly board: Board) {
    this.state = new BoardState(board);
  }

  tap(line: number): TapResult {
    if (this.over || line < 0 || !this.state.alive[line]) return { kind: "ignored" };
    const blocker = this.state.firstBlocker(line);
    if (blocker >= 0) {
      this.lives--;
      this.mistakes++;
      if (this.lives <= 0) this.over = "failed";
      return { kind: "blocked", line, blocker, lives: this.lives, failed: this.over === "failed" };
    }
    const passThrough = this.state.passThrough(line);
    this.state.remove(line);
    this.clears++;
    if (this.state.remaining === 0) this.over = "won";
    return { kind: "free", line, passThrough, won: this.over === "won" };
  }
}
