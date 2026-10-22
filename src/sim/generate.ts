import { DeterministicRng, stableHashString } from "@slu/web-shell";
import { type Board, type Dir, type Line, type Rule, DX, DY, usableCells } from "./board.ts";

export interface GenParams {
  w: number;
  h: number;
  rule: Rule;
  colors: number;
  mask?: Uint8Array | null;
  minLen: number;
  maxLen: number;
  /** Target fraction of usable cells filled. */
  density: number;
  /** Probability a tail step turns instead of running straight. */
  turnBias?: number;
  /** Chroma only: extra weight for heads whose ray crosses same-colour cells (pass-through traps). */
  trapBias?: number;
  /** Extra weight for heads that extend the longest blocking chain. */
  depthBias?: number;
}

/**
 * Builds a board in reverse removal order: every placed line must have a clear ray
 * at the moment it is placed, so removing lines in reverse placement order always works.
 */
export function generate(p: GenParams, seed: number): Board {
  const rng = new DeterministicRng(seed >>> 0);
  const { w, h, rule, colors } = p;
  const n = w * h;
  const mask = p.mask ?? null;
  const owner = new Int32Array(n).fill(-1);
  const colorOf: number[] = [];
  const lines: Line[] = [];
  const turnBias = p.turnBias ?? 0.55;
  const trapBias = p.trapBias ?? 0.6;
  const depthBias = p.depthBias ?? 1.5;
  // down[l] = longest blocking chain starting at line l (l blocks ... blocks the oldest line).
  const down: number[] = [];
  // cover[c] = lines whose ray passes through cell c.
  const cover: number[][] = Array.from({ length: n }, () => []);
  const chainAt = (c: number, color: number) => {
    let best = 0;
    for (const l of cover[c]!) if ((mono || colorOf[l] !== color) && down[l]! > best) best = down[l]!;
    return best;
  };
  const usable = usableCells({ w, h, mask });
  const target = Math.min(usable, Math.round(p.density * usable));
  let filled = 0;
  let failures = 0;
  const mono = rule === "mono" || colors <= 1;

  const isOpen = (c: number) => owner[c] === -1 && !(mask && mask[c]);

  // Scratch buffers for candidate collection.
  const candCell: number[] = [];
  const candDir: Dir[] = [];
  const candW: number[] = [];

  while (filled < target && failures < 60) {
    const color = mono ? 0 : rng.int(0, colors - 1);
    candCell.length = candDir.length = candW.length = 0;
    let total = 0;
    for (let c = 0; c < n; c++) {
      if (!isOpen(c)) continue;
      const cx = c % w, cy = (c / w) | 0;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        // Need room straight behind the head for its shaft — no lone one-cell arrows.
        const bx = cx - DX[d], by = cy - DY[d];
        const roomBehind = bx >= 0 && by >= 0 && bx < w && by < h && isOpen(by * w + bx);
        if (!roomBehind) continue;
        let x = cx + DX[d], y = cy + DY[d];
        let len = 0, same = 0, ok = true;
        while (x >= 0 && y >= 0 && x < w && y < h) {
          const o = owner[y * w + x]!;
          if (o >= 0) {
            if (mono || colorOf[o] !== color) { ok = false; break; }
            same++;
          }
          len++;
          x += DX[d]; y += DY[d];
        }
        if (!ok) continue;
        // Prefer interior heads (long rays create blocking chains) and pass-through traps.
        const chain = chainAt(c, color);
        const weight = 1 + len * 0.6 + (same > 0 ? trapBias * 6 : 0) + depthBias * chain * chain;
        candCell.push(c); candDir.push(d); candW.push(weight); total += weight;
      }
    }
    if (candCell.length === 0) { failures += 10; continue; }

    let r = rng.next() * total, k = 0;
    for (; k < candW.length - 1; k++) { r -= candW[k]!; if (r <= 0) break; }
    const head = candCell[k]!, dir = candDir[k]!;

    // Own ray is forbidden for the tail.
    const ray = new Set<number>();
    { let x = head % w + DX[dir], y = ((head / w) | 0) + DY[dir];
      while (x >= 0 && y >= 0 && x < w && y < h) { ray.add(y * w + x); x += DX[dir]; y += DY[dir]; } }

    const want = rng.int(p.minLen, p.maxLen);
    const cells = [head];
    const used = new Set(cells);
    // The tail leaves the head away from the facing direction.
    let heading = ((dir + 2) % 4) as Dir;
    let x = head % w, y = (head / w) | 0;
    while (cells.length < want) {
      const straight = heading;
      const left = ((heading + 3) % 4) as Dir;
      const right = ((heading + 1) % 4) as Dir;
      // First step runs straight back from the head: every arrowhead continues its last segment.
      const order: Dir[] = cells.length === 1 ? [straight] : rng.chance(turnBias)
        ? (rng.chance(0.5) ? [left, right, straight] : [right, left, straight])
        : (rng.chance(0.5) ? [straight, left, right] : [straight, right, left]);
      let moved = false;
      for (const d of order) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nc = ny * w + nx;
        if (!isOpen(nc) || used.has(nc) || ray.has(nc)) continue;
        cells.push(nc); used.add(nc); x = nx; y = ny; heading = d; moved = true;
        break;
      }
      if (!moved) break;
    }

    const floor = 2;
    if (cells.length < floor) { failures++; continue; }

    const id = lines.length;
    lines.push({ id, color, cells, dir });
    colorOf.push(color);
    let chain = 0;
    for (const c of cells) { owner[c] = id; chain = Math.max(chain, chainAt(c, color)); }
    down.push(chain + 1);
    for (const c of ray) cover[c]!.push(id);
    filled += cells.length;
  }

  return { w, h, rule: mono ? "mono" : "chroma", mask, lines };
}

/** Independent seed sub-stream (regeneration attempts, endless, daily). */
export function subSeed(seed: number, stream: string | number): number {
  return stableHashString(`${seed >>> 0}:${stream}`);
}
