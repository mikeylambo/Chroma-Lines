import type { LoadedLevel } from "../meta/levels.ts";
import type { PlaySession } from "../sim/session.ts";
import type { BoardScene } from "./BoardScene.ts";

export interface DebugOverlay { update(level: LoadedLevel, session: PlaySession): void }

/** ?debug — blocking graph, difficulty score, seed. */
export function mountDebug(scene: BoardScene): DebugOverlay {
  const info = document.createElement("div");
  info.className = "debug";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "debug-graph");
  svg.innerHTML = `<defs><marker id="dbg-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff5"/></marker></defs><g></g>`;
  document.body.append(svg, info);
  return {
    update(level, session) {
      const s = level.score, d = level.def;
      info.textContent = [
        `${d.kind} ${d.key}  ch${d.chapter}  seed ${d.seed}`,
        `difficulty ${s.difficulty.toFixed(2)}  band ${d.band[0].toFixed(2)}–${d.band[1].toFixed(2)}${d.breather ? " (breather)" : ""}`,
        `depth ${s.depth}  branching ${s.branching}  decoys ${s.decoys}  traps ${s.chromaTraps}  monoFree ${s.monoFree}`,
        `lines ${level.board.lines.length}  remaining ${session.state.remaining}  lives ${session.lives}`,
      ].join("\n");
      const g = svg.querySelector("g")!;
      g.innerHTML = "";
      requestAnimationFrame(() => {
        const st = session.state;
        st.alive.forEach((alive, b) => {
          if (!alive) return;
          const a = st.firstBlocker(b);
          if (a < 0) return;
          const p = scene.headScreen(a), q = scene.headScreen(b);
          const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
          l.setAttribute("x1", String(p.x)); l.setAttribute("y1", String(p.y));
          l.setAttribute("x2", String(q.x)); l.setAttribute("y2", String(q.y));
          l.setAttribute("stroke", "#ff5"); l.setAttribute("stroke-width", "1.5"); l.setAttribute("stroke-opacity", ".7");
          l.setAttribute("marker-end", "url(#dbg-a)");
          g.append(l);
        });
      });
    },
  };
}
