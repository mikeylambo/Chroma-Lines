import Phaser from "phaser";
import { type Board, DX, DY, type Line, rayCells } from "../sim/board.ts";
import { BG, FAIL, mix, styleFor, type LineStyle } from "./palette.ts";

// ---- Feel constants (brief §6) ----
const SLIDE_SPEED = 14; // cells / s
const SLIDE_EASE = 0.06; // s
const TRAIL_MS = 220;
const BUMP_MS = 120;
const BUMP_DIST = 0.25; // cells
const HURT_MS = 420; // two red-white pulses
const TOUCH_BRIGHT = 0.3;
const STROKE = 0.42; // of cell
const BUMP_TRAUMA = 0.25;
const MAX_CELL_PX = 76;

export interface Insets { top: number; bottom: number; side: number }

interface Pt { x: number; y: number }

interface ExitAnim {
  path: Pt[]; // cell-space points, unit steps: tail end … head … ray … beyond
  L: number; // index of head in path
  edgeT: number; // path parameter where the head crosses the board edge
  t: number; // seconds since start
  flares: { at: number; line: number; done: boolean }[];
  flashed: boolean;
  trail: { x: number; y: number; t: number }[];
  ghost: boolean;
}

interface LineView {
  index: number;
  line: Line;
  style: LineStyle;
  glow: Phaser.GameObjects.Graphics;
  core: Phaser.GameObjects.Graphics;
  pressed: boolean;
  flare: number; // 0..1
  hurt: number; // ms remaining
  nudge: number; // ms elapsed, <0 = none
  exit: ExitAnim | null;
  gone: boolean;
  dirty: boolean;
  /** Live views draw every frame; idle ones are baked into shared render textures. */
  live: boolean;
  ghost: boolean;
  appear: number; // arrival fade 0..1
  appearDelay: number; // s
}

export interface SceneHooks {
  onPress(line: number): void;
  onTap(line: number): void;
  onPassThrough(): void;
  onReady(): void;
}

export class BoardScene extends Phaser.Scene {
  hooks!: SceneHooks;
  private board: Board | null = null;
  private views: LineView[] = [];
  private ghosts: LineView[] = [];
  private bg!: Phaser.GameObjects.Graphics;
  private nebula: Phaser.GameObjects.Image[] = [];
  private dots!: Phaser.GameObjects.Graphics;
  private rim!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private trailG!: Phaser.GameObjects.Graphics;
  private layer!: Phaser.GameObjects.Container;
  private glowLayer!: Phaser.GameObjects.Layer;
  private rings: Phaser.GameObjects.Image[] = [];
  private hintRings: Phaser.GameObjects.Image[] = [];
  private fxOn = false;
  private bakeGlow!: Phaser.GameObjects.RenderTexture;
  private bakeCore!: Phaser.GameObjects.RenderTexture;
  private scratchGlow!: Phaser.GameObjects.Graphics;
  private scratchCore!: Phaser.GameObjects.Graphics;
  private staticDirty = true;
  private noBake = false;
  private dimRect!: Phaser.GameObjects.Rectangle;
  private blur: Phaser.FX.Blur | null = null;
  private frameAcc = { n: 0, t: 0, slow: 0 };
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cs = 40;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private insets: Insets = { top: 64, bottom: 96, side: 16 };
  private trauma = 0;
  private time0 = 0;
  private pressIndex = -1;
  private pressPt: Pt = { x: 0, y: 0 };
  private hint: { line: number; t: number; kind: "hint" | "cue" } | null = null;
  private sweep: { t: number } | null = null;
  private rimLevel = 0;
  private rimTarget = 0;
  private colorAssist = false;
  private total = 1;
  private inputLocked = false;

  constructor() { super("board"); }

  create(): void {
    this.dpr = this.registry.get("dpr") ?? 1;
    this.noBake = !!this.registry.get("nobake");
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    for (let r = 16; r > 0; r--) { g.fillStyle(0xffffff, 0.06 + (1 - r / 16) * 0.3); g.fillCircle(16, 16, r); }
    g.generateTexture("spark", 32, 32);
    g.destroy();
    const ring = this.textures.createCanvas("ring", 256, 256)!;
    const rc = ring.getContext();
    const grad = rc.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.72, "rgba(255,255,255,0)");
    grad.addColorStop(0.9, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    rc.fillStyle = grad; rc.fillRect(0, 0, 256, 256); ring.refresh();
    const band = this.textures.createCanvas("band", 8, 128)!;
    const bc = band.getContext();
    const bg2 = bc.createLinearGradient(0, 0, 0, 128);
    bg2.addColorStop(0, "rgba(255,255,255,0)"); bg2.addColorStop(0.5, "rgba(255,255,255,1)"); bg2.addColorStop(1, "rgba(255,255,255,0)");
    bc.fillStyle = bg2; bc.fillRect(0, 0, 8, 128); band.refresh();
    const thin = this.textures.createCanvas("ring-thin", 128, 128)!;
    const tc = thin.getContext();
    const tg = tc.createRadialGradient(64, 64, 0, 64, 64, 64);
    tg.addColorStop(0, "rgba(255,255,255,0)");
    tg.addColorStop(0.8, "rgba(255,255,255,0)");
    tg.addColorStop(0.9, "rgba(255,255,255,1)");
    tg.addColorStop(1, "rgba(255,255,255,0)");
    tc.fillStyle = tg; tc.fillRect(0, 0, 128, 128); thin.refresh();

    this.bg = this.add.graphics();
    const neb = this.textures.createCanvas("nebula", 256, 256)!;
    const nc = neb.getContext();
    const ng = nc.createRadialGradient(128, 128, 0, 128, 128, 128);
    ng.addColorStop(0, "rgba(255,255,255,1)");
    ng.addColorStop(0.5, "rgba(255,255,255,0.45)");
    ng.addColorStop(1, "rgba(255,255,255,0)");
    nc.fillStyle = ng; nc.fillRect(0, 0, 256, 256); neb.refresh();
    this.nebula = [[0x0b2a5a, 0.16], [0x2a0b4a, 0.13]].map(([c, a]) => this.add.image(0, 0, "nebula").setTint(c!).setAlpha(a!).setBlendMode(Phaser.BlendModes.ADD));
    if (this.game.renderer.type === Phaser.WEBGL && !this.registry.get("lowfx")) this.fxOn = true;
    this.layer = this.add.container(0, 0);
    // All line glow strokes live in one additive layer, softened by a single blur pass.
    this.glowLayer = this.add.layer().setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    if (!this.fxOn) this.glowLayer.setBlendMode(Phaser.BlendModes.NORMAL);
    if (this.fxOn) this.blur = this.glowLayer.postFX.addBlur(0, 2, 2, this.dpr * 1.25, 0xffffff, 2);
    const W = this.scale.width, H = this.scale.height;
    this.bakeGlow = this.make.renderTexture({ x: 0, y: 0, width: W, height: H }, false).setOrigin(0);
    this.glowLayer.add(this.bakeGlow);
    this.bakeCore = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(3);
    this.scratchGlow = this.make.graphics({}, false);
    this.scratchCore = this.make.graphics({}, false);
    this.dimRect = this.add.rectangle(0, 0, W, H, 0x02040b, 1).setOrigin(0).setDepth(15).setAlpha(0);
    this.hintRings = [0, 1, 2].map(() => this.add.image(0, 0, "ring-thin").setBlendMode(Phaser.BlendModes.ADD).setDepth(17).setVisible(false));
    this.rings = [0x7feaff, 0xff6ab8, 0xffd56a].map((c) => this.add.image(0, 0, "band").setTint(c).setBlendMode(Phaser.BlendModes.ADD).setDepth(18).setVisible(false));
    this.dots = this.add.graphics();
    this.rim = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.trailG = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.fx = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.layer.add([this.dots, this.rim]);
    this.sparks = this.add.particles(0, 0, "spark", {
      lifespan: { min: 280, max: 620 },
      speed: { min: 60, max: 340 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(20);
    this.fx.setDepth(19);
    this.trailG.setDepth(5);

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p.x, p.y));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p.x, p.y));
    this.input.on("pointerupoutside", () => this.release());
    this.scale.on("resize", () => this.layout());
    this.drawBackground();
    this.hooks?.onReady();
  }

  // ---------- Public API ----------

  setInsets(insets: Insets): void { this.insets = insets; if (this.board) this.layout(); else this.drawBackground(); }
  setColorAssist(on: boolean): void { this.colorAssist = on; this.views.forEach((v) => (v.dirty = true)); }
  setLocked(locked: boolean): void { this.inputLocked = locked; if (locked) this.release(); }

  loadBoard(board: Board): void {
    for (const v of [...this.views, ...this.ghosts]) { v.glow.destroy(); v.core.destroy(); }
    this.ghosts = [];
    this.board = board;
    this.total = board.lines.length;
    this.hint = null;
    this.sweep = null;
    this.trailG.clear();
    this.rimLevel = this.rimTarget = 0;
    this.views = board.lines.map((line, index) => this.makeView(line, index, false));
    // Arrival: lines fade in with a staggered shimmer.
    const stagger = Math.min(0.022, 0.5 / Math.max(1, this.views.length));
    this.views.forEach((v, i) => { v.appear = 0; v.appearDelay = 0.04 + i * stagger; });
    this.tweens.killTweensOf(this.dimRect);
    this.dimRect.setAlpha(0);
    this.staticDirty = true;
    this.layout();
  }

  /** Start a free line's slide-out. Rules already removed it from the sim. */
  exit(index: number, passThrough: number[]): void {
    const v = this.views[index];
    if (!v || v.exit) return;
    v.exit = this.makeExit(v.line, passThrough, false);
    v.pressed = false;
    this.rimTarget = 1 - this.aliveCount() / Math.max(1, this.total);
    if (this.hint?.line === index) this.hint = null;
  }

  bump(index: number, blocker: number): void {
    const v = this.views[index];
    const b = this.views[blocker];
    if (v) { v.nudge = 0; v.pressed = false; v.dirty = true; }
    if (b) { b.hurt = HURT_MS; b.dirty = true; }
    this.trauma = Math.min(1, this.trauma + BUMP_TRAUMA);
  }

  showHint(index: number, kind: "hint" | "cue" = "hint"): void { this.hint = index >= 0 ? { line: index, t: 0, kind } : null; }
  clearHint(): void { this.hint = null; }

  /** First chroma board: a ghost of the free line demonstrates passing through its own colour. */
  demoPassThrough(index: number, passThrough: number[]): void {
    const src = this.views[index];
    if (!src) return;
    const ghost = this.makeView(src.line, index, true);
    ghost.exit = this.makeExit(src.line, passThrough, true);
    this.ghosts.push(ghost);
  }

  winSweep(): void {
    this.sweep = { t: 0 };
    this.rimTarget = 1;
    const b = this.board!;
    const cx = this.ox + (b.w * this.cs) / 2, cy = this.oy + (b.h * this.cs) / 2;
    // Prism wipe: three refracted bands sweep up through the cleared board.
    const W = this.scale.width, top = this.oy - this.cs, bottom = this.oy + b.h * this.cs + this.cs;
    this.rings.forEach((r, k) => {
      r.setPosition(cx, bottom).setDisplaySize(W * 1.2, this.cs * 2.4).setAngle(-6 + k * 6).setAlpha(0).setVisible(true);
      this.tweens.add({ targets: r, y: top, duration: 900, delay: k * 110, ease: "Sine.easeInOut", onComplete: () => r.setVisible(false) });
      this.tweens.add({ targets: r, alpha: { from: 0, to: 0.85 }, duration: 450, delay: k * 110, yoyo: true, ease: "Sine.easeInOut" });
    });
    this.sparks.setParticleTint(0xffffff);
    this.sparks.emitParticleAt(cx, cy, 40);
  }

  setDim(dim: boolean): void {
    this.tweens.killTweensOf(this.dimRect);
    this.tweens.add({ targets: this.dimRect, alpha: dim ? 0.6 : 0, duration: 320, ease: "Sine.easeInOut" });
  }

  /** Screen-space centre of a line's head (for DOM overlays / tests). */
  headScreen(index: number): Pt {
    const v = this.views[index];
    if (!v) return { x: 0, y: 0 };
    const c = v.line.cells[0]!;
    const p = this.toPx(c % this.board!.w + 0.5, ((c / this.board!.w) | 0) + 0.5);
    return { x: p.x / this.dpr, y: p.y / this.dpr };
  }

  get cellPx(): number { return this.cs / this.dpr; }

  // ---------- Layout ----------

  private layout(): void {
    const W = this.scale.width, H = this.scale.height;
    this.drawBackground();
    if (!this.board) return;
    const { w, h } = this.board;
    const d = this.dpr;
    const availW = W - this.insets.side * 2 * d;
    const availH = H - (this.insets.top + this.insets.bottom) * d;
    this.cs = Math.floor(Math.min(availW / w, availH / h, MAX_CELL_PX * d));
    this.ox = Math.round((W - this.cs * w) / 2);
    this.oy = Math.round(this.insets.top * d + (availH - this.cs * h) / 2);
    this.drawDots();
    this.drawRim();
    for (const rt of [this.bakeGlow, this.bakeCore]) if (rt.width !== W || rt.height !== H) rt.resize(W, H);
    this.dimRect.setSize(W, H);
    this.views.forEach((v) => (v.dirty = true));
    this.staticDirty = true;
  }

  private toPx(cx: number, cy: number): Pt { return { x: this.ox + cx * this.cs, y: this.oy + cy * this.cs }; }

  private drawBackground(): void {
    const W = this.scale.width, H = this.scale.height;
    this.bg.clear();
    this.bg.fillGradientStyle(BG.top, BG.top, BG.bottom, BG.bottom, 1);
    this.bg.fillRect(0, 0, W, H);
  }

  private drawDots(): void {
    const b = this.board!;
    this.dots.clear();
    const r = Math.max(1, this.cs * 0.05);
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        if (b.mask && b.mask[y * b.w + x]) continue;
        const p = this.toPx(x + 0.5, y + 0.5);
        this.dots.fillStyle(BG.dot, 0.55);
        this.dots.fillCircle(p.x, p.y, r);
      }
  }

  private drawRim(): void {
    const b = this.board!;
    this.rim.clear();
    if (!b.mask) return;
    const a = 0.1 + this.rimLevel * 0.65;
    const usable = (x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h && !b.mask![y * b.w + x];
    const col = b.rule === "mono" ? 0x9feeff : mix(0x8fdcff, 0xffffff, this.rimLevel * 0.5);
    for (const [width, alpha] of [[this.cs * 0.22, a * 0.18], [this.cs * 0.06, a]] as const) {
      this.rim.lineStyle(width, col, alpha);
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) {
          if (!usable(x, y)) continue;
          const p = this.toPx(x, y), s = this.cs;
          if (!usable(x, y - 1)) this.rim.lineBetween(p.x, p.y, p.x + s, p.y);
          if (!usable(x, y + 1)) this.rim.lineBetween(p.x, p.y + s, p.x + s, p.y + s);
          if (!usable(x - 1, y)) this.rim.lineBetween(p.x, p.y, p.x, p.y + s);
          if (!usable(x + 1, y)) this.rim.lineBetween(p.x + s, p.y, p.x + s, p.y + s);
        }
    }
  }

  // ---------- Views ----------

  private makeView(line: Line, index: number, ghost: boolean): LineView {
    const style = styleFor(this.board!.rule, line.color);
    const glow = this.add.graphics();
    this.glowLayer.add(glow);
    const core = this.add.graphics().setDepth(ghost ? 9 : 3);
    return { index, line, style, glow, core, pressed: false, flare: 0, hurt: 0, nudge: -1, exit: null, gone: false, dirty: true, live: true, ghost, appear: 1, appearDelay: 0 };
  }

  private makeExit(line: Line, passThrough: number[], ghost: boolean): ExitAnim {
    const b = this.board!;
    const pts: Pt[] = line.cells.map((c) => ({ x: (c % b.w) + 0.5, y: ((c / b.w) | 0) + 0.5 })).reverse();
    const L = pts.length - 1;
    const ray = rayCells(b, line);
    const head = pts[L]!;
    const extra = ray.length + L + 3;
    for (let k = 1; k <= extra; k++) pts.push({ x: head.x + DX[line.dir] * k, y: head.y + DY[line.dir] * k });
    const flares = passThrough.map((p) => {
      const k = ray.findIndex((c) => b.lines[p]!.cells.includes(c));
      return { at: L + k + 1, line: p, done: false };
    });
    return { path: pts, L, edgeT: L + ray.length + 0.5, t: 0, flares, flashed: false, trail: [], ghost };
  }

  private aliveCount(): number { return this.views.filter((v) => !v.exit && !v.gone).length; }

  // ---------- Input ----------

  private pick(px: number, py: number): number {
    const b = this.board;
    if (!b) return -1;
    const fx = (px - this.ox) / this.cs, fy = (py - this.oy) / this.cs;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    if (cx >= 0 && cy >= 0 && cx < b.w && cy < b.h) {
      const c = cy * b.w + cx;
      const v = this.views.find((v) => !v.exit && !v.gone && v.line.cells.includes(c));
      if (v) return v.index;
    }
    // Nearest segment within 0.6 cell — or 22 px, whichever is larger (44 px effective target).
    const radius = Math.max(0.6, (22 * this.dpr) / this.cs);
    let best = -1, bestD = radius;
    for (const v of this.views) {
      if (v.exit || v.gone) continue;
      const cells = v.line.cells;
      for (let i = 0; i < cells.length; i++) {
        const ax = (cells[i]! % b.w) + 0.5, ay = ((cells[i]! / b.w) | 0) + 0.5;
        const nb = cells[Math.min(i + 1, cells.length - 1)]!;
        const bx = (nb % b.w) + 0.5, by = ((nb / b.w) | 0) + 0.5;
        const d = segDist(fx, fy, ax, ay, bx, by);
        if (d < bestD) { bestD = d; best = v.index; }
      }
    }
    return best;
  }

  private down(x: number, y: number): void {
    if (this.inputLocked) return;
    const i = this.pick(x, y);
    this.pressIndex = i;
    this.pressPt = { x, y };
    if (i >= 0) {
      const v = this.views[i]!;
      v.pressed = true;
      // <16 ms acknowledgement: lift out of the bake and redraw before this frame renders.
      if (!v.live) { v.live = true; v.glow.setVisible(true); v.core.setVisible(true); this.bake(this.time.now); }
      this.drawView(v, this.time.now);
      this.hooks.onPress(i);
    }
  }

  private up(x: number, y: number): void {
    const i = this.pressIndex;
    this.release();
    if (i < 0 || this.inputLocked) return;
    const moved = Math.hypot(x - this.pressPt.x, y - this.pressPt.y) / this.cs;
    if (moved > 0.9 && this.pick(x, y) !== i) return; // dragged off: cancel
    this.hooks.onTap(i);
  }

  private release(): void {
    if (this.pressIndex >= 0) { const v = this.views[this.pressIndex]; if (v) { v.pressed = false; v.dirty = true; } }
    this.pressIndex = -1;
  }

  // ---------- Frame ----------

  update(time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    if (!this.time0) this.time0 = time;
    this.drawNebula(time);
    this.watchFrames(dt);

    // Camera trauma shake.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const s = this.trauma * this.trauma * 14 * this.dpr;
      this.cameras.main.setScroll((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
    } else this.cameras.main.setScroll(0, 0);

    if (Math.abs(this.rimTarget - this.rimLevel) > 0.002 && this.board?.mask) {
      this.rimLevel += (this.rimTarget - this.rimLevel) * Math.min(1, dt * 4);
      this.drawRim();
    }

    this.trailG.clear();
    for (const v of this.views) this.step(v, dt, time);
    for (const g of this.ghosts) this.step(g, dt, time);
    if (this.staticDirty) this.bake(time);
    this.ghosts = this.ghosts.filter((g) => {
      if (g.gone) { g.glow.destroy(); g.core.destroy(); return false; }
      return true;
    });

    this.fx.clear();
    this.drawHint(dt);
    if (this.sweep) this.drawSweep(dt);
  }

  private bake(time: number): void {
    this.staticDirty = false;
    this.scratchGlow.clear();
    this.scratchCore.clear();
    for (const v of this.views) if (!v.live && !v.gone && !v.exit && v.appear >= 1) this.drawView(v, time, this.scratchGlow, this.scratchCore);
    this.bakeGlow.clear().draw(this.scratchGlow);
    this.bakeCore.clear().draw(this.scratchCore);
  }

  private step(v: LineView, dt: number, time: number): void {
    if (v.gone) return;
    let animating = false;
    if (v.appear < 1) {
      v.appearDelay -= dt;
      if (v.appearDelay <= 0) v.appear = Math.min(1, v.appear + dt / 0.26);
      animating = true;
    }
    const live = this.noBake || v.appear < 1 || v.pressed || v.flare > 0 || v.hurt > 0 || v.nudge >= 0 || !!v.exit || this.hint?.line === v.index;
    if (live !== v.live) {
      v.live = live;
      v.glow.setVisible(live);
      v.core.setVisible(live);
      if (!live) { v.glow.clear(); v.core.clear(); } else v.dirty = true;
      this.staticDirty = true;
    }
    if (!live) {
      if (v.dirty) { v.dirty = false; this.staticDirty = true; }
      return;
    }
    if (v.flare > 0) { v.flare = Math.max(0, v.flare - dt * 3.2); animating = true; }
    if (v.hurt > 0) { v.hurt = Math.max(0, v.hurt - dt * 1000); animating = true; }
    if (v.nudge >= 0) { v.nudge += dt * 1000; if (v.nudge > BUMP_MS) v.nudge = -1; animating = true; }
    if (v.exit) { this.stepExit(v, dt, time); animating = true; }
    if (animating || v.dirty) this.drawView(v, time);
  }

  private stepExit(v: LineView, dt: number, time: number): void {
    const e = v.exit!;
    e.t += dt;
    const s = slideDistance(e.t);
    const headT = s + e.L;
    const hp = pointAt(e.path, Math.min(headT, e.path.length - 1));
    const px = this.toPx(hp.x, hp.y);
    e.trail.push({ x: px.x, y: px.y, t: time });
    while (e.trail.length && time - e.trail[0]!.t > TRAIL_MS) e.trail.shift();
    this.drawTrail(e, v.style, time);

    for (const f of e.flares) {
      if (!f.done && headT >= f.at) {
        f.done = true;
        const other = this.views[f.line];
        if (other && !other.exit) { other.flare = 1; other.dirty = true; }
        v.flare = 1;
        const fp = pointAt(e.path, f.at);
        const p = this.toPx(fp.x, fp.y);
        this.sparks.setParticleTint(v.style.line);
        this.sparks.emitParticleAt(p.x, p.y, e.ghost ? 5 : 9);
        this.hooks.onPassThrough();
      }
    }
    if (!e.flashed && headT >= e.edgeT) {
      e.flashed = true;
      const ep = pointAt(e.path, e.edgeT);
      const p = this.toPx(ep.x, ep.y);
      this.sparks.setParticleTint(0xffffff);
      this.sparks.emitParticleAt(p.x, p.y, e.ghost ? 6 : 14);
    }
    if (headT - e.edgeT >= e.L + 1.4) {
      v.gone = true;
      v.glow.clear(); v.core.clear();
      if (!e.ghost) { v.glow.destroy(); v.core.destroy(); }
    }
  }

  private drawTrail(e: ExitAnim, style: LineStyle, time: number): void {
    const t = e.trail;
    const w = this.cs * STROKE * 0.9;
    for (let i = 1; i < t.length; i++) {
      const age = (time - t[i]!.t) / TRAIL_MS;
      const a = (1 - age) * (e.ghost ? 0.25 : 0.55);
      if (a <= 0) continue;
      this.trailG.lineStyle(w * (1 - age * 0.6), mix(style.glow, 0xffffff, 0.35), a);
      this.trailG.lineBetween(t[i - 1]!.x, t[i - 1]!.y, t[i]!.x, t[i]!.y);
    }
  }

  // ---------- Drawing ----------

  private drawView(v: LineView, time: number, glowTarget?: Phaser.GameObjects.Graphics, coreTarget?: Phaser.GameObjects.Graphics): void {
    v.dirty = false;
    const b = this.board!;
    const cs = this.cs;
    let pts: Pt[];
    let alpha = 1 - Math.pow(1 - v.appear, 3);
    let white = 0;
    if (v.exit) {
      const e = v.exit;
      const s = slideDistance(e.t);
      pts = slice(e.path, s, s + e.L);
      const past = s + e.L - e.edgeT;
      if (past > 0) { white = Math.min(0.75, past * 1.2); alpha *= Math.max(0, 1 - past / (e.L + 1.4)); }
    } else {
      pts = v.line.cells.map((c) => ({ x: (c % b.w) + 0.5, y: ((c / b.w) | 0) + 0.5 })).reverse();
    }
    // Bump nudge: out fast, spring back with slight overshoot.
    let off = 0;
    if (v.nudge >= 0) {
      const k = v.nudge / BUMP_MS;
      off = k < 0.3 ? BUMP_DIST * easeOut(k / 0.3) : BUMP_DIST * spring((k - 0.3) / 0.7);
    }
    const ox = DX[v.line.dir] * off, oy = DY[v.line.dir] * off;
    const px = pts.map((p) => this.toPx(p.x + ox, p.y + oy));

    let color = v.style.line;
    let glowColor = v.style.glow;
    let bright = 1;
    if (v.pressed) { color = mix(color, 0xffffff, TOUCH_BRIGHT); bright = 1.3; }
    if (v.flare > 0) { color = mix(color, 0xffffff, v.flare * 0.7); bright += v.flare * 1.2; }
    if (v.hurt > 0) {
      const phase = 1 - v.hurt / HURT_MS; // two pulses
      const pulse = Math.sin(phase * Math.PI * 4);
      color = pulse > 0 ? mix(color, FAIL, pulse) : mix(color, 0xffffff, -pulse * 0.8);
      glowColor = mix(glowColor, FAIL, Math.abs(pulse));
      bright += Math.abs(pulse) * 0.8;
    }
    if (white > 0) { color = mix(color, 0xffffff, white); glowColor = mix(glowColor, 0xffffff, white * 0.6); bright += white; }
    if (this.hint?.line === v.index && !v.exit) bright += 0.35 + 0.35 * Math.sin(time / 180);

    const g = glowTarget ?? v.glow, c = coreTarget ?? v.core;
    if (!glowTarget) {
      g.clear(); c.clear();
      // Fade whole objects so overlapping primitives never double up mid-fade.
      g.setAlpha(Math.max(0, alpha) * (v.ghost ? 0.6 : 1));
      c.setAlpha(Math.max(0, alpha) * (v.ghost ? 0.42 : 1));
    }
    if (alpha <= 0) return;
    const ga = 1;
    // Additive outer glow.
    const hp = px[px.length - 1]!;
    if (this.fxOn) {
      const gw = cs * 0.78, gA = Math.min(1, 0.42 * bright) * ga;
      g.lineStyle(gw, glowColor, gA); stroke(g, px);
      g.fillStyle(glowColor, gA);
      g.fillCircle(px[0]!.x, px[0]!.y, gw / 2);
      g.fillCircle(hp.x, hp.y, gw / 2);
    } else {
      // No blur pass: an opaque, pre-mixed halo with round joints (no doubled alpha at corners).
      const gw = cs * 0.66, halo = mix(BG.top, glowColor, Math.min(0.6, 0.24 * bright));
      g.lineStyle(gw, halo, 1); stroke(g, px);
      g.fillStyle(halo, 1);
      for (const p of px) g.fillCircle(p.x, p.y, gw / 2);
    }

    // Rounded core.
    const w = cs * STROKE;
    c.lineStyle(w, color, ga); stroke(c, px);
    c.fillStyle(color, ga);
    for (const p of px) c.fillCircle(p.x, p.y, w / 2);
    // Inner highlight.
    c.lineStyle(w * 0.28, mix(color, 0xffffff, 0.55), 0.5 * ga); stroke(c, px);

    // Colour-blind stroke pattern (subtle by default, strong with assist).
    const strong = this.colorAssist;
    const dark = 0x060914;
    if (v.style.pattern === "dots") {
      c.fillStyle(dark, (strong ? 0.85 : 0.45) * ga);
      for (let i = 0; i < px.length - 1; i++) c.fillCircle(px[i]!.x, px[i]!.y, w * (strong ? 0.22 : 0.15));
    } else if (v.style.pattern === "stripe") {
      c.lineStyle(w * (strong ? 0.26 : 0.16), dark, (strong ? 0.8 : 0.45) * ga);
      stroke(c, px.slice(0, Math.max(2, px.length)), true);
    }

    this.drawHead(c, hp, v.line.dir, v.style, color, ga, strong);
  }

  private drawHead(c: Phaser.GameObjects.Graphics, p: Pt, dir: number, style: LineStyle, color: number, a: number, strong: boolean): void {
    const s = this.cs * (strong ? 1.1 : 1);
    const dx = DX[dir as 0], dy = DY[dir as 0];
    const at = (u: number, v: number) => ({ x: p.x + (u * dx - v * dy) * s, y: p.y + (u * dy + v * dx) * s });
    // Heads: no hard outline. A soft dark underlay cuts the head out of its own body
    // (crucial when the head turns off the last segment), then an opaque near-white head.
    const head = mix(color, 0xffffff, 0.82);
    const dark = 0x050814;
    const grow = (pts: Pt[], k: number) => {
      const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length, cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
      return pts.map((q) => ({ x: cx + (q.x - cx) * k, y: cy + (q.y - cy) * k }));
    };
    const shape = (pts: Pt[]) => {
      c.fillStyle(dark, 0.18 * a); c.fillPoints(grow(pts, 1.32), true, true);
      c.fillStyle(dark, 0.32 * a); c.fillPoints(grow(pts, 1.16), true, true);
      c.fillStyle(head, a); c.fillPoints(pts, true, true);
    };
    const chev = (u0: number, size: number, width: number) => {
      c.lineStyle(width, dark, 0.85 * a);
      c.beginPath();
      const a1 = at(u0 - size, size * 1.05), a2 = at(u0 + size * 0.7, 0), a3 = at(u0 - size, -size * 1.05);
      c.moveTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.lineTo(a3.x, a3.y);
      c.strokePath();
    };
    if (style.head === "chevron") {
      shape([at(0.5, 0), at(-0.04, 0.4), at(0.1, 0), at(-0.04, -0.4)]);
    } else if (style.head === "diamond") {
      shape([at(0.52, 0), at(0.1, 0.36), at(-0.26, 0), at(0.1, -0.36)]);
      chev(0.12, 0.13, s * 0.075);
    } else {
      const cx = at(0.1, 0);
      c.fillStyle(dark, 0.18 * a); c.fillCircle(cx.x, cx.y, s * 0.46);
      c.fillStyle(dark, 0.32 * a); c.fillCircle(cx.x, cx.y, s * 0.4);
      c.fillStyle(head, a); c.fillCircle(cx.x, cx.y, s * 0.35);
      chev(0.1, 0.13, s * 0.075);
    }
  }

  private drawNebula(time: number): void {
    const W = this.scale.width, H = this.scale.height;
    const t = time / 1000;
    const R = Math.max(W, H);
    const pos = [
      [0.25 + 0.06 * Math.sin(t * 0.05), 0.22 + 0.05 * Math.cos(t * 0.04), 1.3],
      [0.78 + 0.05 * Math.cos(t * 0.035), 0.74 + 0.06 * Math.sin(t * 0.045), 1.4],
    ];
    this.nebula.forEach((img, i) => img.setPosition(pos[i]![0]! * W, pos[i]![1]! * H).setScale((R * pos[i]![2]!) / 256));
  }

  /** Adaptive quality: if frames stay slow, drop the blur pass and widen raw glow instead. */
  private watchFrames(dt: number): void {
    if (!this.blur) return;
    const f = this.frameAcc;
    f.n++; f.t += dt;
    if (f.t < 2) return;
    const fps = f.n / f.t;
    f.n = 0; f.t = 0;
    f.slow = fps < 45 ? f.slow + 1 : 0;
    if (f.slow >= 2) {
      this.glowLayer.postFX.remove(this.blur);
      this.blur = null;
      this.fxOn = false;
      this.glowLayer.setBlendMode(Phaser.BlendModes.NORMAL);
      this.views.forEach((v) => (v.dirty = true));
    }
  }

  private drawHint(dt: number): void {
    const h = this.hint;
    if (!h) { this.hintRings.forEach((r) => r.setVisible(false)); return; }
    h.t += dt;
    const v = this.views[h.line];
    if (!v || v.exit || v.gone) { this.hint = null; this.hintRings.forEach((r) => r.setVisible(false)); return; }
    const b = this.board!;
    const c = v.line.cells[0]!;
    const p = this.toPx((c % b.w) + 0.5, ((c / b.w) | 0) + 0.5);
    const col = h.kind === "hint" ? 0xffffff : mix(v.style.line, 0xffffff, 0.4);
    const peak = h.kind === "hint" ? 1 : 0.7;
    // Two expanding ripples + one steady breathing ring.
    for (let k = 0; k < 2; k++) {
      const ph = (h.t * 0.9 + k * 0.5) % 1;
      const r = this.cs * (0.5 + ph * 1.0);
      this.hintRings[k]!.setVisible(true).setPosition(p.x, p.y).setTint(col).setScale(r / 64).setAlpha(peak * (1 - ph));
    }
    this.hintRings[2]!.setVisible(true).setPosition(p.x, p.y).setTint(col).setScale((this.cs * 0.56) / 64).setAlpha(peak * (0.55 + 0.3 * Math.sin(h.t * 6)));
  }

  private drawSweep(dt: number): void {
    const s = this.sweep!;
    s.t += dt;
    if (s.t > 1.6) this.sweep = null;
  }
}

// ---------- Helpers ----------

function slideDistance(t: number): number {
  if (t < SLIDE_EASE) return 0.5 * (SLIDE_SPEED / SLIDE_EASE) * t * t;
  return 0.5 * SLIDE_SPEED * SLIDE_EASE + SLIDE_SPEED * (t - SLIDE_EASE);
}

function pointAt(path: Pt[], t: number): Pt {
  const i = Math.max(0, Math.min(path.length - 2, Math.floor(t)));
  const f = Math.max(0, Math.min(1, t - i));
  const a = path[i]!, b = path[i + 1]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function slice(path: Pt[], a: number, b: number): Pt[] {
  const out = [pointAt(path, a)];
  for (let i = Math.floor(a) + 1; i < b && i < path.length; i++) out.push(path[i]!);
  out.push(pointAt(path, b));
  return out;
}

function stroke(g: Phaser.GameObjects.Graphics, pts: Pt[], skipHead = false): void {
  const n = skipHead ? pts.length - 1 : pts.length;
  if (n < 2) {
    const p = pts[0]!;
    g.beginPath(); g.moveTo(p.x - 0.01, p.y); g.lineTo(p.x + 0.01, p.y); g.strokePath();
    return;
  }
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < n; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.strokePath();
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
/** 1 → 0 with a small overshoot below zero. */
const spring = (t: number) => { const k = Math.max(0, Math.min(1, t)); return Math.cos(k * Math.PI * 1.15) * (1 - k) * (k < 1 ? 1 : 0); };
