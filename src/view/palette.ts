import palettes from "../content/palettes.json" with { type: "json" };

export type HeadShape = "chevron" | "diamond" | "circle";
export type Pattern = "solid" | "dots" | "stripe";

export interface LineStyle {
  line: number;
  glow: number;
  head: HeadShape;
  pattern: Pattern;
}

const hex = (s: string) => parseInt(s.slice(1), 16);

export const MONO: LineStyle = { line: hex(palettes.mono.line), glow: hex(palettes.mono.glow), head: "chevron", pattern: "solid" };
export const CHROMA: LineStyle[] = palettes.chroma.map((c) => ({ line: hex(c.line), glow: hex(c.glow), head: c.head as HeadShape, pattern: c.pattern as Pattern }));
export const BG = {
  top: hex(palettes.background.top),
  bottom: hex(palettes.background.bottom),
  accent: hex(palettes.background.accent),
  dot: hex(palettes.background.dot),
};
export const FAIL = hex(palettes.fail);
export const CSS_COLORS = palettes.chroma.map((c) => c.line);

export function styleFor(rule: "mono" | "chroma", color: number): LineStyle {
  return rule === "mono" ? MONO : CHROMA[color % CHROMA.length]!;
}

/** Linear mix of two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return ((r & 255) << 16) | ((g & 255) << 8) | (bl & 255);
}
