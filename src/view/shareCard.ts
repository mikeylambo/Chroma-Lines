import type { Board } from "../sim/board.ts";
import { DX, DY } from "../sim/board.ts";
import { styleFor } from "./palette.ts";

const css = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Renders the day's board (as everyone saw it — no solution order) with stars and streak. */
export function renderShareCard(board: Board, opts: { day: string; stars: number; streak: number }): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1230"); bg.addColorStop(1, "#02030a");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // Wordmark.
  g.textAlign = "center";
  g.font = '900 92px "Inter Display", Inter, "Avenir Next", system-ui, sans-serif';
  const grad = g.createLinearGradient(W / 2 - 320, 0, W / 2 + 320, 0);
  grad.addColorStop(0, "#3ee8ff"); grad.addColorStop(0.55, "#ff4fae"); grad.addColorStop(1, "#ffd04a");
  g.fillStyle = grad; g.shadowColor = "#ff4fae88"; g.shadowBlur = 30;
  g.fillText("CHROMA LINES", W / 2, 150);
  g.shadowBlur = 0;
  g.font = '700 40px Inter, "Avenir Next", system-ui, sans-serif';
  g.fillStyle = "#9fb4e6";
  g.fillText(`☀  ${opts.day}`, W / 2, 215);

  // Board.
  const size = 760, cs = size / Math.max(board.w, board.h);
  const ox = (W - cs * board.w) / 2, oy = 270 + (size - cs * board.h) / 2;
  const pt = (c0: number) => ({ x: ox + ((c0 % board.w) + 0.5) * cs, y: oy + (((c0 / board.w) | 0) + 0.5) * cs });
  g.fillStyle = "#2a3a66";
  for (let i = 0; i < board.w * board.h; i++) if (!board.mask || !board.mask[i]) { const p = pt(i); g.beginPath(); g.arc(p.x, p.y, cs * 0.05, 0, Math.PI * 2); g.fill(); }
  g.lineCap = "round"; g.lineJoin = "round";
  for (const line of board.lines) {
    const st = styleFor(board.rule, line.color);
    const pts = line.cells.map(pt).reverse();
    g.strokeStyle = css(st.line); g.lineWidth = cs * 0.22; g.shadowColor = css(st.glow); g.shadowBlur = cs * 0.4;
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
    const h = pts[pts.length - 1]!, dx = DX[line.dir], dy = DY[line.dir];
    const at = (u: number, v: number) => [h.x + (u * dx - v * dy) * cs, h.y + (u * dy + v * dx) * cs] as const;
    g.fillStyle = css(st.line); g.beginPath();
    g.moveTo(...at(0.48, 0)); g.lineTo(...at(0.12, 0.28)); g.lineTo(...at(0.12, -0.28)); g.closePath(); g.fill();
  }
  g.shadowBlur = 0;

  // Stars + streak.
  const star = (x: number, y: number, r: number, lit: boolean) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = lit ? "#ffd04a" : "#1b2446"; g.shadowColor = "#ffd04acc"; g.shadowBlur = lit ? 24 : 0; g.fill(); g.shadowBlur = 0;
  };
  [0, 1, 2].forEach((k) => star(W / 2 + (k - 1) * 110, 1150, k === 1 ? 52 : 42, k < opts.stars));
  g.font = '800 46px Inter, "Avenir Next", system-ui, sans-serif';
  g.fillStyle = "#ffd04a";
  g.fillText(`🔥 ${opts.streak}`, W / 2, 1265);
  return c;
}

/** Share the card as an image where supported; otherwise share or copy the text version. */
export async function shareCard(canvas: HTMLCanvasElement, text: string, onCopied: () => void): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (blob && nav.share && nav.canShare) {
    const file = new File([blob], "chroma-lines-daily.png", { type: "image/png" });
    if (nav.canShare({ files: [file] })) { try { await nav.share({ files: [file], text }); return; } catch { return; } }
  }
  if (nav.share) { try { await nav.share({ text }); return; } catch { return; } }
  try { await navigator.clipboard.writeText(text); onCopied(); } catch { /* nothing else to do */ }
}
