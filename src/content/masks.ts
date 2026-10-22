// Silhouette masks, defined as resolution-independent shapes sampled at cell centres.
// Output: Uint8Array where 1 = void cell.

export type MaskName = "star" | "heart" | "crown" | "bolt" | "sigil" | "diamond" | "hex" | "moon" | "ring";

type Pt = readonly [number, number];
type Shape = (x: number, y: number) => boolean; // x,y in [-1,1], y down

function inPoly(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const starPoly: Pt[] = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? 1.04 : 0.54;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.08] as const;
});
const crownPoly: Pt[] = [[-0.98, 0.75], [-0.98, -0.62], [-0.52, -0.05], [0, -0.92], [0.52, -0.05], [0.98, -0.62], [0.98, 0.75]];
const boltPoly: Pt[] = [[0.25, -1], [-0.72, 0.12], [-0.08, 0.12], [-0.32, 1], [0.74, -0.18], [0.1, -0.18], [0.42, -1]];
const sigilOuter: Pt[] = [[0, -1], [1, 0.82], [-1, 0.82]];
const sigilInner: Pt[] = [[0, -0.12], [0.36, 0.5], [-0.36, 0.5]];
const hexPoly: Pt[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3;
  return [Math.cos(a), Math.sin(a) * 0.98] as const;
});

const shapes: Record<MaskName, Shape> = {
  star: (x, y) => inPoly(starPoly, x, y),
  heart: (x, y) => {
    const X = x * 1.2, Y = -(y * 1.2) + 0.25;
    const a = X * X + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y <= 0;
  },
  crown: (x, y) => inPoly(crownPoly, x, y),
  bolt: (x, y) => inPoly(boltPoly, x, y),
  sigil: (x, y) => inPoly(sigilOuter, x, y) && !inPoly(sigilInner, x, y),
  diamond: (x, y) => Math.abs(x) + Math.abs(y) <= 1.04,
  hex: (x, y) => inPoly(hexPoly, x, y),
  moon: (x, y) => x * x + y * y <= 1.0 && (x - 0.45) * (x - 0.45) + (y + 0.2) * (y + 0.2) > 0.55,
  ring: (x, y) => { const r = x * x + y * y; return r <= 1.0 && r >= 0.16; },
};

export function buildMask(name: MaskName, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1;
      const v = ((y + 0.5) / h) * 2 - 1;
      out[y * w + x] = shapes[name](u, v) ? 0 : 1;
    }
  return out;
}

export const MASK_NAMES = Object.keys(shapes) as MaskName[];
