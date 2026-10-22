import Phaser from "phaser";
import { AudioLifecycleCoordinator, BrowserHaptics } from "@slu/web-shell";
import "./view/ui.css";
import { SynthAudio } from "./audio/engine.ts";
import { AHA_LEVEL, CAMPAIGN_LENGTH } from "./content/curveSpec.ts";
import { DailyLight } from "./meta/daily.ts";
import { HintEconomy } from "./meta/hints.ts";
import { endlessBoard, endlessPoints, type LevelKind, type LoadedLevel, loadLevel } from "./meta/levels.ts";
import { Progress, starsFor } from "./meta/progress.ts";
import { GameTelemetry } from "./meta/telemetry.ts";
import { createPlatform } from "./platform/index.ts";
import { PlaySession } from "./sim/session.ts";
import { criticalMove, solve } from "./sim/solve.ts";
import { BoardScene } from "./view/BoardScene.ts";
import { mountDebug, type DebugOverlay } from "./view/debug.ts";
import { renderShareCard, shareCard } from "./view/shareCard.ts";
import { CSS_COLORS } from "./view/palette.ts";
import { UI } from "./view/ui.ts";

const COMBO_WINDOW = 1200;
const HINT_IDLE_MS = 20000;
const params = new URLSearchParams(location.search);

const platform = createPlatform();
const progress = new Progress(platform);
const hints = new HintEconomy(progress, platform);
const daily = new DailyLight(progress);
const telemetry = new GameTelemetry();
const audio = new SynthAudio();
const lifecycle = new AudioLifecycleCoordinator(audio);
const haptics = new BrowserHaptics({ bump: { mobile: [18], gamepad: { duration: 60, strong: 0.4, weak: 0.6 } }, clear: { mobile: [6], gamepad: { duration: 30, strong: 0, weak: 0.3 } } } as never);

let scene: BoardScene;
let ui: UI;
let debug: DebugOverlay | null = null;
let current: LoadedLevel;
let session: PlaySession;
let combo = 0;
let lastClearAt = -Infinity;
let lastTapAt = performance.now();
let paused = false;
let ended = false;
let idleTimer = 0;
let cueTimer = 0;
let demoTimer = 0;
let levelStartAt = 0;
let capT = 0;
let boardPasses = 0; // lines cleared this board by passing through their own colour
const cache = new Map<string, LoadedLevel>();

function keyOf(kind: LevelKind, index: number): string { return kind === "daily" ? `daily:${daily.key}` : `${kind}:${index}`; }
function fetchLevel(kind: LevelKind, index: number): LoadedLevel {
  const k = keyOf(kind, index);
  let l = cache.get(k);
  if (!l) { l = loadLevel(kind, index); cache.set(k, l); }
  return l;
}
function kindFor(index: number): LevelKind { return index > CAMPAIGN_LENGTH ? "endless" : "campaign"; }

function runBoard(n: number): LoadedLevel {
  const run = progress.data.endless.run!;
  const k = `run:${run.seed}:${n}`;
  let l = cache.get(k);
  if (!l) { l = endlessBoard(run.seed, n); cache.set(k, l); }
  return l;
}

function pregenerateNext(): void {
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 300));
  if (current.def.kind === "daily") return;
  if (current.def.kind === "endless") { const n = current.def.index + 1; idle(() => runBoard(n)); return; }
  const next = current.def.index + 1;
  idle(() => fetchLevel(kindFor(next), next));
}

// ---------------- Level lifecycle ----------------

function start(level: LoadedLevel): void {
  current = level;
  session = new PlaySession(level.board);
  combo = 0;
  ended = false;
  paused = false;
  lastTapAt = levelStartAt = performance.now();
  boardPasses = 0;
  clearTimeout(cueTimer);
  clearTimeout(demoTimer);
  ui.close();
  ui.setHudVisible(true);
  ui.setLives(session.lives);
  ui.setHints(hints.count);
  ui.pulseHint(false);
  if (level.def.kind === "endless") {
    const run = progress.data.endless.run!;
    session.lives = run.lives;
    ui.setLives(run.lives);
    ui.setLevel("endless", level.def.index, run.score);
  } else ui.setLevel(level.def.kind, level.def.index, daily.streak);
  scene.setLocked(false);
  scene.setDim(false);
  scene.loadBoard(level.board);
  audio.setChapter(level.def.chapter);
  telemetry.begin(level.def);
  debug?.update(level, session);
  if (level.def.kind === "daily") daily.markAttempt();
  else if (level.def.kind === "campaign") {
    progress.data.current = level.def.index;
    void progress.save();
  }
  scheduleTutorialCue();
  maybeDemoPassThrough();
  pregenerateNext();
}

function startIndex(index: number): void {
  if (index > CAMPAIGN_LENGTH) { startRun(false); return; }
  start(fetchLevel(kindFor(index), index));
}

// ---------------- Endless runs ----------------
// Lives carry across boards; the run ends at zero. Score = Σ board points; best is the leaderboard score.

function startRun(fresh: boolean): void {
  const e = progress.data.endless;
  if (fresh || !e.run) {
    e.run = { seed: (Math.random() * 0xffffffff) >>> 0, n: 1, score: 0, lives: 3 };
    e.runs++;
    void progress.save();
  }
  lifecycle.setGamePaused(false);
  start(runBoard(e.run.n));
}

function endRun(): void {
  const e = progress.data.endless;
  const run = e.run!;
  const newBest = run.score > e.best;
  e.best = Math.max(e.best, run.score);
  e.bestBoards = Math.max(e.bestBoards, run.n - 1);
  e.run = null;
  void progress.save();
  platform.submitScore(e.best);
  telemetry.emit("level_fail", { mistakes: session.mistakes, runScore: run.score, boards: run.n - 1 });
  setTimeout(() => {
    audio.fail();
    scene.setDim(true);
    ui.setHudVisible(false);
    ui.showRunOver(run.score, e.best, newBest, run.n - 1);
  }, 420);
}

function restartSame(): void {
  start(current);
}

/** L1-3: if the player hesitates, a soft ripple on a free line — no words. */
function scheduleTutorialCue(): void {
  if (current.def.kind !== "campaign" || current.def.index > 3) return;
  const delay = current.def.index === 3 ? 7000 : 2600;
  cueTimer = window.setTimeout(() => {
    if (ended || paused) return;
    if (performance.now() - lastTapAt < delay - 50) { scheduleTutorialCue(); return; }
    const free = session.state.freeLines();
    if (free.length) scene.showHint(free[0]!, "cue");
  }, delay);
}

/**
 * Pass-through teaching, wordless. First chroma board: a ghost slides through its own colour.
 * Until the player has made a few pass-through clears themselves, the ghost replays on any
 * chroma board after a mistake or a long hesitation (once per board).
 */
const PASS_LEARNED = 3;
let demoShown = false;
let demoIdleTimer = 0;
function playPassDemo(delay: number): boolean {
  const st = session.state;
  const pick = st.freeLines().find((i) => st.passThrough(i).length > 0);
  if (pick === undefined) return false;
  demoShown = true;
  const play = (n: number, wait: number) => {
    demoTimer = window.setTimeout(() => {
      if (ended || paused || !st.alive[pick]) return;
      scene.demoPassThrough(pick, st.passThrough(pick));
      if (n > 1) play(n - 1, 2000);
    }, wait);
  };
  play(2, delay);
  return true;
}
function maybeDemoPassThrough(): void {
  demoShown = false;
  clearTimeout(demoIdleTimer);
  if (current.board.rule !== "chroma") return;
  if (current.def.kind === "campaign" && current.def.index === AHA_LEVEL && !progress.data.seen.aha) {
    if (playPassDemo(1100)) { progress.data.seen.aha = true; void progress.save(); }
    return;
  }
  armPassIdle();
}
function armPassIdle(): void {
  clearTimeout(demoIdleTimer);
  if (demoShown || current.board.rule !== "chroma" || progress.data.seen.passClears >= PASS_LEARNED) return;
  demoIdleTimer = window.setTimeout(() => { if (!ended && !paused) playPassDemo(0); }, 9000);
}

function onTap(line: number): void {
  if (paused || ended) return;
  lastTapAt = performance.now();
  ui.pulseHint(false);
  scene.clearHint();
  clearTimeout(cueTimer);
  const r = session.tap(line);
  if (r.kind === "ignored") return;
  if (r.kind === "free") {
    const now = performance.now();
    combo = now - lastClearAt <= COMBO_WINDOW ? combo + 1 : 0;
    lastClearAt = now;
    scene.exit(line, r.passThrough);
    if (r.passThrough.length) boardPasses++;
    if (r.passThrough.length && progress.data.seen.passClears < PASS_LEARNED) progress.data.seen.passClears++;
    armPassIdle();
    audio.clear(combo);
    haptics.pulse("clear");
    const color = current.board.rule === "mono" ? "#d9fbff" : CSS_COLORS[current.board.lines[line]!.color] ?? "#fff";
    ui.showCombo(combo + 1, color);
    telemetry.emit("tap_free", { line, combo });
    if (r.won) win();
    else scheduleTutorialCue();
  } else {
    scene.bump(line, r.blocker);
    audio.bump();
    haptics.pulse("bump");
    ui.setLives(r.lives, true);
    if (current.def.kind === "endless") { progress.data.endless.run!.lives = r.lives; void progress.save(); }
    telemetry.emit("tap_blocked", { line, blocker: r.blocker });
    telemetry.emit("life_lost", { lives: r.lives });
    if (r.failed) fail();
    else {
      scheduleTutorialCue();
      if (!demoShown && current.board.rule === "chroma" && progress.data.seen.passClears < PASS_LEARNED) { clearTimeout(demoIdleTimer); playPassDemo(700); }
    }
  }
  debug?.update(current, session);
}

function win(): void {
  ended = true;
  scene.setLocked(true);
  const stars = starsFor(session.mistakes);
  const def = current.def;
  let hintEarned = false;
  let dailyInfo: { streak: number; share: () => void } | undefined;
  let endlessInfo: { points: number; total: number } | undefined;
  if (def.kind === "daily") {
    hintEarned = daily.complete() > 0;
    dailyInfo = { streak: daily.streak, share: () => shareDaily(stars) };
    telemetry.emit("daily_complete", { stars, streak: daily.streak });
  } else if (def.kind === "endless") {
    const e = progress.data.endless, run = e.run!;
    const points = endlessPoints(current.board, def.index, session.mistakes, boardPasses);
    run.score += points;
    run.n = def.index + 1;
    run.lives = session.lives;
    if (stars === 3) hintEarned = (progress.data.hints++, true);
    if (run.score > e.best) { e.best = run.score; platform.submitScore(e.best); }
    e.bestBoards = Math.max(e.bestBoards, def.index);
    endlessInfo = { points, total: run.score };
    ui.setLevel("endless", def.index, run.score);
  } else {
    hintEarned = progress.recordClear(def.index, stars) > 0;
  }
  void progress.save();
  ui.setHints(hints.count);
  telemetry.emit("level_clear", { stars, mistakes: session.mistakes, ms: Math.round(performance.now() - levelStartAt) });
  setTimeout(() => { audio.chord(); scene.winSweep(); }, 380);
  setTimeout(() => {
    ui.setHudVisible(false);
    ui.showResults(stars, { hintEarned, daily: dailyInfo, endless: endlessInfo, onStar: (i) => audio.tick(i) });
  }, 1150);
}

function shareDaily(stars: number): void {
  const day = daily.key.replace("daily:", "");
  const text = `Chroma Lines · Daily Light ${day}\n${"★".repeat(stars)}${"☆".repeat(3 - stars)}  🔥${daily.streak}\n${location.origin}`;
  const card = renderShareCard(current.board, { day, stars, streak: daily.streak });
  void shareCard(card, text, () => ui.toast("✓"));
}

function fail(): void {
  ended = true;
  scene.setLocked(true);
  if (current.def.kind === "endless") { endRun(); return; }
  telemetry.emit("level_fail", { mistakes: session.mistakes });
  setTimeout(() => {
    audio.fail();
    scene.setDim(true);
    ui.setHudVisible(false);
    ui.showFail();
  }, 420);
}

function next(): void {
  audio.ui();
  const def = current.def;
  if (def.kind === "daily") { startIndex(Math.min(progress.data.unlocked, progress.data.current)); return; }
  if (def.kind === "endless") { start(runBoard(def.index + 1)); return; }
  const n = def.index + 1;
  // Chapter complete: show the map on the way to the next chapter.
  if (def.kind === "campaign" && def.index % 10 === 0) {
    openMap(Math.min(6, def.index / 10 + 1));
    return;
  }
  startIndex(n);
}

function useHint(): void {
  if (paused || ended) return;
  const move = criticalMove(session.state);
  if (move < 0) return;
  if (hints.spend()) {
    scene.showHint(move, "hint");
    ui.setHints(hints.count);
    ui.pulseHint(false);
    audio.ui();
    telemetry.emit("hint_used", { line: move, left: hints.count });
    lastTapAt = performance.now();
    return;
  }
  // Rewarded ad: freeze input, timers and audio while it plays, restore after either outcome.
  scene.setLocked(true);
  lifecycle.setGamePaused(true);
  clearTimeout(cueTimer);
  clearTimeout(demoIdleTimer);
  void hints.adSlot("hint").then((ok) => {
    lifecycle.setGamePaused(false);
    scene.setLocked(false);
    lastTapAt = performance.now();
    if (ok) { ui.setHints(hints.count); useHint(); } else ui.shakeHint();
  });
}

function pause(): void {
  if (ended && !ui.open) return;
  if (paused) return;
  paused = true;
  scene.setLocked(true);
  lifecycle.setGamePaused(true);
  // Nothing counts down behind the menu: tutorial cue, pass-through demo and idle hint all stop.
  clearTimeout(cueTimer);
  clearTimeout(demoIdleTimer);
  clearTimeout(demoTimer);
  void progress.flush();
  ui.setToggles(progress.data.settings.muted, progress.data.settings.colorAssist);
  ui.showPause();
}

function resume(): void {
  if (!paused) { if (ended) return; }
  paused = false;
  lifecycle.setGamePaused(false);
  if (ended) return;
  ui.close();
  ui.setHudVisible(true);
  scene.setLocked(false);
  lastTapAt = performance.now();
  scheduleTutorialCue();
  armPassIdle();
}

function openMap(focusChapter?: number): void {
  paused = true;
  scene.setLocked(true);
  lifecycle.setGamePaused(false);
  ui.setHudVisible(false);
  ui.showMap({
    unlocked: progress.data.unlocked,
    current: Math.min(progress.data.current, progress.data.unlocked),
    stars: progress.data.stars,
    daily: { streak: daily.streak, done: daily.completedToday, attempted: daily.attemptedToday },
    endlessBest: progress.data.endless.best,
    focusChapter,
  });
}

function playDaily(): void {
  if (daily.attemptedToday) { openMap(); return; }
  lifecycle.setGamePaused(false);
  start(fetchLevel("daily", 0));
}

// ---------------- Boot ----------------

async function boot(): Promise<void> {
  await platform.init();
  await progress.load();
  const s = progress.data.settings;
  // Muted if either the host (YouTube's player) or the player's own setting says so.
  // The in-game toggle only ever changes the player's preference, never overrides the host.
  let hostMuted = false;
  const applyMute = () => audio.setMuted(hostMuted || s.muted);
  applyMute();
  lifecycle.installVisibility();
  // Host pause (YouTube backgrounding, tab hidden): open our pause menu so the board, timers
  // and audio all stop; the player resumes deliberately.
  platform.onPause(() => { if (current && !ended) pause(); else lifecycle.setGamePaused(true); void progress.flush(); });
  platform.onResume(() => { if (!paused) lifecycle.setGamePaused(false); });
  platform.onAudioToggle((enabled) => { hostMuted = !enabled; applyMute(); });

  ui = new UI(document.getElementById("ui")!, {
    pause, resume, hint: useHint, next,
    replay: () => { audio.ui(); start(current.def.kind === "campaign" ? fetchLevel("campaign", current.def.index) : current); },
    retry: () => { audio.ui(); if (current.def.kind === "endless") startRun(true); else restartSame(); },
    toggleSound: () => { s.muted = !s.muted; applyMute(); ui.setToggles(s.muted, s.colorAssist); void progress.save(); },
    toggleAssist: () => { s.colorAssist = !s.colorAssist; scene.setColorAssist(s.colorAssist); ui.setToggles(s.muted, s.colorAssist); void progress.save(); },
    openMap: () => openMap(),
    playLevel: (lvl) => { lifecycle.setGamePaused(false); startIndex(lvl); },
    playDaily,
    firstGesture: () => audio.unlock(),
  });

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  scene = new BoardScene();
  const host = document.getElementById("game")!;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: "#04060f",
    scale: { mode: Phaser.Scale.NONE, width: innerWidth * dpr, height: innerHeight * dpr, zoom: 1 / dpr },
    render: { antialias: true, powerPreference: "high-performance" },
    fps: { target: 60 },
    banner: false,
    callbacks: { preBoot: (g) => { g.registry.set("dpr", dpr); g.registry.set("lowfx", params.has("lowfx") || lowTier()); g.registry.set("nobake", params.has("nobake")); } },
    scene: [],
  });
  const resize = () => {
    game.scale.resize(innerWidth * dpr, innerHeight * dpr);
    game.scale.setZoom(1 / dpr);
    scene.setInsets(insets());
  };
  window.addEventListener("resize", resize);

  await new Promise<void>((resolve) => {
    scene.hooks = {
      onPress: () => audio.touch(),
      onTap,
      onPassThrough: (k) => { audio.passThrough(k); haptics.pulse("clear"); },
      onReady: () => resolve(),
    };
    game.scene.add("board", scene, true);
  });
  scene.setInsets(insets());
  scene.setColorAssist(s.colorAssist);

  if (params.has("debug")) debug = mountDebug(scene);

  const startAt = params.get("level");
  const first = startAt ? Math.max(1, Math.min(Number(startAt) || 1, 999)) : Math.max(1, Math.min(progress.data.current, progress.data.unlocked));
  if (params.has("daily")) start(fetchLevel("daily", 0));
  else startIndex(first);
  // Report the first frame only once the board has actually been drawn (two rAFs = rendered).
  requestAnimationFrame(() => requestAnimationFrame(() => { platform.firstFrame(); platform.gameReady(); }));

  // Idle → hint button pulses.
  idleTimer = window.setInterval(() => {
    if (!paused && !ended && performance.now() - lastTapAt > HINT_IDLE_MS && hints.count > 0) ui.pulseHint(true);
  }, 1000);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "p") { if (paused) resume(); else pause(); }
    else if (e.key === "h") useHint();
  });
  window.addEventListener("pagehide", () => { if (!ended) telemetry.emit("quit", { remaining: session.state.remaining }); void progress.flush(); });

  // Automation / QA hooks.
  (window as unknown as { __chroma: unknown }).__chroma = {
    level: () => current.def,
    remaining: () => session.state.remaining,
    lives: () => session.lives,
    passFree: () => session.state.freeLines().filter((i) => session.state.passThrough(i).length > 0),
    muted: () => audio.isMuted,
    free: () => session.state.freeLines(),
    blocked: () => session.state.alive.map((a, i) => (a && session.state.firstBlocker(i) >= 0 ? i : -1)).filter((i) => i >= 0),
    solution: () => solve(session.state).order,
    head: (i: number) => scene.headScreen(i),
    tap: (i: number) => onTap(i),
    save: () => structuredClone(progress.data),
    telemetry: () => telemetry.recorder.snapshot(),
    // Store-art / trailer capture: freeze the real loop and advance in fixed steps.
    freeze: () => { game.loop.sleep(); capT = performance.now(); },
    advance: (ms: number, fps = 30) => { for (let t = 0; t < ms; t += 1000 / fps) { capT += 1000 / fps; game.step(capT, 1000 / fps); } },
    shareCard: () => renderShareCard(current.board, { day: daily.key.replace("daily:", ""), stars: 3, streak: 5 }).toDataURL("image/png"),
    hud: (on: boolean) => { ui.setHudVisible(on); document.body.classList.toggle("capture", !on); },
  };
}

/** Budget-device guess before the first frame: start without the blur pass instead of
 * discovering slow frames 2–4 s in. deviceMemory is Chromium-only (Android); iOS keeps full FX. */
function lowTier(): boolean {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return mem !== undefined && mem <= 4;
}

function insets() {
  const portrait = innerHeight >= innerWidth;
  return { top: portrait ? 72 : 64, bottom: portrait ? 104 : 24, side: portrait ? 14 : 96 };
}

void boot();
void idleTimer;
