# Chroma Lines

Arrow-escape logic puzzle on the SLU web shell (vendored, built from `mikeylambo/Web-Game-Shell-v1.02` source). Phaser 3 board, DOM UI, WebAudio synth.

```
npm run dev            # play locally (?level=N, ?daily, ?debug, ?lowfx)
npm test               # node --test: solvability (10k seeds), determinism, curve, speed, chroma, tutorial lock
npm run curve          # rebuild src/content/curve.json from src/content/curveSpec.ts
npm run build          # web build; PLATFORM=youtube npm run build for the YouTube adapter
node tools/e2e/play.mjs  # headless playtest (CHROMIUM=path, BASE_URL optional)
```

Layout: `src/sim` (rules, generator, solver, scoring, session — pure), `src/view` (Phaser scene, UI, debug), `src/content` (curve, masks, palettes, tutorials), `src/meta` (levels, saves, hints, daily, telemetry), `src/platform` (Web/YouTube adapters), `src/audio` (synth + `catalog.ts` stem hooks).

## Tuning changed from the brief
- Difficulty normalisation: `raw / (usableCells/16)^0.1` (brief left the exponent open; 0.1 lets the curve climb with board size).
- Generator adds `depthBias` (weights heads extending the longest blocking chain) and per-chapter `trapBias`; turn bias 0.55 as briefed.
- Density 0.88 (ch1) / 0.9 (ch2, ch4–6) / 0.92 (ch3 silhouettes). Silhouette boards use 12–16 grids so masked area stays comparable.
- Masks drop disconnected islands; ch6 uses diamond/hex/moon/ring/heart/crown/sigil/star (bolt reads poorly at 16).
- L11 (aha) is band-exempt like breathers and required to be fully jammed under mono reading.
- Glow = one blurred additive layer (adaptive: drops blur if < 45 fps sustained).
