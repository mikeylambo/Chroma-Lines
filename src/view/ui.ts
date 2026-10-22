import { CHAPTERS, CAMPAIGN_LENGTH } from "../content/curveSpec.ts";

const I = {
  pause: `<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M7 4.5l9 7.5-9 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  replay: `<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4.5 3.8v4.6h4.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sound: `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.2 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  assist: `<svg viewBox="0 0 24 24"><path d="M3 6.5l4 3-4 3z"/><path d="M12.5 3.5l3 3-3 3-3-3z"/><circle cx="19" cy="17" r="3"/><path d="M3 19h9" stroke="currentColor" stroke-width="2.2" stroke-dasharray="2 2.4"/></svg>`,
  map: `<svg viewBox="0 0 24 24"><circle cx="7" cy="18" r="2.6"/><circle cx="17" cy="12" r="2.6"/><circle cx="8" cy="5.5" r="2.6"/><path d="M9 16.6l5.8-3.3M14.8 10.6L10 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></g></svg>`,
  bulb: `<svg viewBox="0 0 24 24"><path d="M12 2.8a6.6 6.6 0 0 0-3.9 11.9c.6.5.9 1.1.9 1.8v.8h6v-.8c0-.7.3-1.3.9-1.8A6.6 6.6 0 0 0 12 2.8z"/><rect x="9" y="18.6" width="6" height="2.2" rx="1.1"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  infinity: `<svg viewBox="0 0 24 24"><path d="M7 8.5a3.5 3.5 0 1 0 0 7c3 0 7-7 10-7a3.5 3.5 0 1 1 0 7c-3 0-7-7-10-7z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`,
};

export interface UIHandlers {
  pause(): void;
  resume(): void;
  hint(): void;
  next(): void;
  replay(): void;
  retry(): void;
  toggleSound(): void;
  toggleAssist(): void;
  openMap(): void;
  playLevel(level: number): void;
  playDaily(): void;
  firstGesture(): void;
}

export interface MapModel {
  unlocked: number;
  current: number;
  stars: Record<number, number>;
  daily: { streak: number; done: boolean; attempted: boolean };
  focusChapter?: number;
}

const h = (tag: string, cls = "", html = ""): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const btn = (cls: string, icon: string, label: string, on: () => void): HTMLButtonElement => {
  const b = h("button", cls, icon) as HTMLButtonElement;
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.addEventListener("click", (e) => { e.stopPropagation(); on(); });
  return b;
};

export class UI {
  readonly root: HTMLElement;
  private lives: HTMLElement[] = [];
  private levelLabel: HTMLElement;
  private hintBtn: HTMLButtonElement;
  private hintCount: HTMLElement;
  private combo: HTMLElement;
  private overlay: HTMLElement;
  private soundBtn: HTMLButtonElement | null = null;
  private assistBtn: HTMLButtonElement | null = null;
  private muted = false;
  private assist = false;
  private comboTimer = 0;

  constructor(root: HTMLElement, private readonly on: UIHandlers) {
    this.root = root;
    root.innerHTML = "";
    const top = h("div", "topbar");
    const pips = h("div", "lives");
    for (let i = 0; i < 3; i++) { const p = h("i", "pip"); pips.append(p); this.lives.push(p); }
    this.levelLabel = h("div", "level");
    top.append(pips, this.levelLabel, btn("icon pause", I.pause, "Pause", () => on.pause()));
    this.hintBtn = btn("hint", I.bulb, "Hint", () => on.hint());
    this.hintCount = h("b", "count");
    this.hintBtn.append(this.hintCount);
    this.combo = h("div", "combo");
    this.overlay = h("div", "overlay");
    root.append(top, this.combo, this.hintBtn, this.overlay);
    const unlock = () => on.firstGesture();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
  }

  // ---- HUD ----

  setLevel(kind: "campaign" | "endless" | "daily", index: number, streak = 0): void {
    if (kind === "daily") this.levelLabel.innerHTML = `${I.sun}<span>${streak > 0 ? streak : ""}</span>`;
    else if (kind === "endless") this.levelLabel.innerHTML = `${I.infinity}<span>${index - CAMPAIGN_LENGTH}</span>`;
    else this.levelLabel.innerHTML = `<span>${index}</span>`;
    this.levelLabel.className = `level ${kind}`;
  }

  setLives(n: number, animateLoss = false): void {
    this.lives.forEach((p, i) => {
      const was = !p.classList.contains("lost");
      p.classList.toggle("lost", i >= n);
      if (animateLoss && was && i >= n) { p.classList.remove("break"); void p.offsetWidth; p.classList.add("break"); }
    });
  }

  setHints(n: number): void {
    this.hintCount.textContent = String(n);
    this.hintBtn.classList.toggle("empty", n <= 0);
  }

  pulseHint(on: boolean): void { this.hintBtn.classList.toggle("pulse", on); }
  shakeHint(): void { this.hintBtn.classList.remove("shake"); void this.hintBtn.offsetWidth; this.hintBtn.classList.add("shake"); }

  showCombo(n: number, color: string): void {
    if (n < 2) return;
    this.combo.textContent = `×${n}`;
    this.combo.style.setProperty("--c", color);
    this.combo.classList.remove("pop"); void this.combo.offsetWidth; this.combo.classList.add("pop");
    clearTimeout(this.comboTimer);
    this.comboTimer = window.setTimeout(() => this.combo.classList.remove("pop"), 1200);
  }

  setHudVisible(v: boolean): void { this.root.classList.toggle("hud-hidden", !v); }

  setToggles(muted: boolean, assist: boolean): void {
    this.muted = muted; this.assist = assist;
    if (this.soundBtn) { this.soundBtn.innerHTML = muted ? I.mute : I.sound; this.soundBtn.classList.toggle("off", muted); }
    if (this.assistBtn) this.assistBtn.classList.toggle("on", assist);
  }

  // ---- Overlays ----

  close(): void {
    this.overlay.className = "overlay";
    this.overlay.innerHTML = "";
    this.soundBtn = this.assistBtn = null;
  }

  get open(): boolean { return this.overlay.classList.contains("show"); }

  private show(kind: string, content: HTMLElement): void {
    this.overlay.innerHTML = "";
    this.overlay.append(content);
    this.overlay.className = `overlay ov-${kind}`;
    requestAnimationFrame(() => this.overlay.classList.add("show"));
  }

  showPause(): void {
    const card = h("div", "card pause-card");
    const resume = btn("big glow", I.play, "Resume", () => this.on.resume());
    const row = h("div", "row");
    this.soundBtn = btn("icon round", this.muted ? I.mute : I.sound, "Sound", () => this.on.toggleSound());
    this.assistBtn = btn("icon round", I.assist, "Colour assist", () => this.on.toggleAssist());
    row.append(this.soundBtn, this.assistBtn, btn("icon round", I.map, "Chapter map", () => this.on.openMap()), btn("icon round sun", I.sun, "Daily Light", () => this.on.playDaily()));
    card.append(resume, row);
    this.show("pause", card);
    this.setToggles(this.muted, this.assist);
    resume.focus({ preventScroll: true });
  }

  /** Stars land one at a time; `onStar(i)` fires as each lands (audio tick). */
  showResults(stars: number, opts: { hintEarned: boolean; daily?: { streak: number }; onStar: (i: number) => void }): void {
    const card = h("div", "card results");
    const row = h("div", "stars");
    const slots = [0, 1, 2].map(() => { const s = h("i", "star", I.star); row.append(s); return s; });
    card.append(row);
    if (opts.daily) card.append(h("div", "streak", `${I.sun}<span>${opts.daily.streak}</span>`));
    if (opts.hintEarned) card.append(h("div", "earned", `${I.bulb}<span>+1</span>`));
    const next = btn("big glow next", I.next, "Next", () => this.on.next());
    const replay = btn("icon small replay", I.replay, "Replay", () => this.on.replay());
    card.append(next, replay);
    this.show("results", card);
    slots.forEach((s, i) => {
      if (i >= stars) return;
      setTimeout(() => { s.classList.add("lit"); opts.onStar(i); }, 380 + i * 250);
    });
    setTimeout(() => { card.classList.add("ready"); next.focus({ preventScroll: true }); }, 380 + stars * 250);
  }

  showFail(): void {
    const card = h("div", "card fail");
    const retry = btn("big glow retry", I.replay, "Retry", () => this.on.retry());
    card.append(retry);
    this.show("fail", card);
    retry.focus({ preventScroll: true });
  }

  showMap(m: MapModel): void {
    const wrap = h("div", "map");
    const head = h("div", "map-head");
    head.append(btn("icon close", I.close, "Close", () => this.on.resume()));
    wrap.append(head);
    const scroller = h("div", "map-scroll");
    const daily = h("div", "daily-card");
    daily.innerHTML = `<span class="d-icon">${I.sun}</span><span class="d-streak">${m.daily.streak}</span>`;
    const dailyBtn = btn(`icon round daily-go ${m.daily.done ? "done" : ""}`, m.daily.done ? I.check : I.play, "Daily Light", () => { if (!m.daily.attempted) this.on.playDaily(); });
    if (m.daily.attempted) dailyBtn.disabled = true;
    daily.append(dailyBtn);
    scroller.append(daily);
    let focusEl: HTMLElement | null = null;
    for (const ch of CHAPTERS) {
      const sec = h("section", `chapter c${ch.id}`);
      const first = (ch.id - 1) * 10 + 1;
      const got = Array.from({ length: 10 }, (_, i) => m.stars[first + i] ?? 0).reduce((a, b) => a + b, 0);
      sec.append(h("h3", "", `<span>${ch.name}</span><em>${I.star}${got}/30</em>`));
      const path = h("div", "path");
      for (let i = 0; i < 10; i++) {
        const lvl = first + i;
        const locked = lvl > m.unlocked;
        const node = btn(`node ${locked ? "locked" : ""} ${lvl === m.current ? "current" : ""} ${lvl % 5 === 0 ? "breather" : ""}`, locked ? I.lock : `<span>${lvl}</span>`, `Level ${lvl}`, () => { if (!locked) this.on.playLevel(lvl); });
        node.style.setProperty("--x", String(Math.sin(i * 0.9) * 34));
        const st = m.stars[lvl] ?? 0;
        if (st > 0) node.append(h("div", "nstars", [0, 1, 2].map((k) => `<i class="${k < st ? "on" : ""}">${I.star}</i>`).join("")));
        if (lvl === m.current) focusEl = node;
        path.append(node);
      }
      sec.append(path);
      if (m.focusChapter === ch.id) focusEl = sec;
      scroller.append(sec);
    }
    const endless = h("section", "chapter endless");
    const eLocked = m.unlocked <= CAMPAIGN_LENGTH;
    endless.append(btn(`node big-node ${eLocked ? "locked" : ""}`, eLocked ? I.lock : I.infinity, "Endless", () => { if (!eLocked) this.on.playLevel(Math.max(CAMPAIGN_LENGTH + 1, m.unlocked)); }));
    scroller.append(endless);
    wrap.append(scroller);
    this.show("mapview", wrap);
    requestAnimationFrame(() => (focusEl as HTMLElement | null)?.scrollIntoView({ block: "center" }));
  }
}
