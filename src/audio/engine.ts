import type { AudioSystem } from "@slu/web-shell";
import { AUDIO_CATALOG, PENTATONIC } from "./catalog.ts";

const MASTER = 0.75;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Generated synth layer. Gameplay calls semantic methods (clear, bump, chord...);
 * all sound design lives here.
 */
export class SynthAudio implements AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private verb!: ConvolverNode;
  private padNodes: AudioNode[] = [];
  private padGain: GainNode | null = null;
  private stemSource: AudioBufferSourceNode | null = null;
  private muted = false;
  private root = 60;
  private chapter = 1;
  private paused = false;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();

  /** Must run inside a user gesture (autoplay policy). Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === "suspended" && !this.paused) void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    // Safety limiter only — a lower threshold pumped the pad under every pluck.
    comp.threshold.value = -4; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted || this.paused ? 0 : MASTER;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
    this.verb = ctx.createConvolver();
    // Reverb tail is built after the unlock gesture returns, so the first tap never waits on it.
    setTimeout(() => { this.verb.buffer = this.impulse(1.8); }, 0);
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    this.verb.connect(wet).connect(this.master);
    this.startPad();
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    // Exponential decay by running multiply (no per-sample pow) and a cheap LCG for noise.
    const k = Math.pow(0.001, 1 / len);
    let seed = 0x2545f491;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let env = 1;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        d[i] = (seed / 2147483648) * env;
        env *= k;
      }
    }
    return buf;
  }

  setChapter(chapter: number): void {
    if (chapter === this.chapter && this.padGain) return;
    this.chapter = chapter;
    this.root = (AUDIO_CATALOG[chapter] ?? AUDIO_CATALOG[1]!).root;
    if (this.ctx) this.startPad();
  }

  // --- AudioSystem contract (shell AudioLifecycle drives pauseAll/resumeAll) ---
  setBusVolume(bus: string, value: number): void {
    if (!this.ctx) return;
    const node = bus === "music" ? this.music : bus === "sfx" ? this.sfx : this.master;
    node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }
  get isMuted(): boolean { return this.muted; }
  // Fade, then suspend: no clicks, no stutter when tabs swap focus rapidly.
  pauseAll(): void {
    this.paused = true;
    this.applyGain();
    clearTimeout(this.suspendTimer);
    this.suspendTimer = window.setTimeout(() => { if (this.paused) void this.ctx?.suspend(); }, 400);
  }
  resumeAll(): void {
    this.paused = false;
    clearTimeout(this.suspendTimer);
    void this.ctx?.resume().then(() => this.applyGain());
  }
  private suspendTimer = 0;
  private applyGain(): void {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(this.muted || this.paused ? 0 : MASTER, t, 0.08);
  }

  // --- Pad ---
  private startPad(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (this.padGain) {
      const old = this.padGain, nodes = this.padNodes;
      old.gain.setTargetAtTime(0, now, 0.6);
      setTimeout(() => nodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* already stopped */ } n.disconnect(); }), 3000);
    }
    this.stemSource?.stop(); this.stemSource = null;
    this.padNodes = [];
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, now, 1.5);
    g.connect(this.music);
    this.padGain = g;

    const stem = AUDIO_CATALOG[this.chapter]?.padStem;
    if (stem) {
      void this.buffer(stem).then((b) => {
        if (!b || this.padGain !== g) return;
        const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.connect(g); src.start();
        this.stemSource = src;
      });
      return;
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 520; filter.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt).connect(filter.frequency); lfo.start();
    const level = ctx.createGain(); level.gain.value = 0.032;
    filter.connect(level).connect(g);
    level.connect(this.verb);
    for (const [deg, det] of [[0, -7], [0, 6], [7, 3], [12 + 4, -4], [-12, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = deg === -12 ? "sine" : "sawtooth";
      o.frequency.value = mtof(this.root - 12 + deg);
      o.detune.value = det;
      o.connect(filter); o.start();
      this.padNodes.push(o);
    }
    this.padNodes.push(lfo, filter, level, lfoAmt);
  }

  private buffer(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url).then((r) => r.arrayBuffer()).then((a) => this.ctx!.decodeAudioData(a)).catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  // --- Voices ---
  private note(midi: number, at: number, dur: number, vol: number, type: OscillatorType = "triangle", wet = 0.5): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = mtof(midi + 12);
    const f = ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(5200, at); f.frequency.exponentialRampToValueAtTime(900, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g);
    g.connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.verb); }
    o.start(at); o2.start(at); o.stop(at + dur + 0.05); o2.stop(at + dur + 0.05);
  }

  private scale(step: number): number {
    const oct = Math.floor(step / PENTATONIC.length);
    return this.root + 12 * oct + PENTATONIC[((step % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length]!;
  }

  /** A line clears. `combo` 0.. climbs the pentatonic scale. */
  clear(combo: number): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.note(this.scale(combo + 5), t, 0.55, 0.22);
  }

  passThrough(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.note(this.scale(12), t, 0.25, 0.06, "sine", 0.8);
  }

  touch(): void {
    if (!this.ctx || this.muted) return;
    this.note(this.scale(15), this.ctx.currentTime, 0.06, 0.025, "sine", 0);
  }

  bump(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260;
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t); o.stop(t + 0.3);
    // Muted click body.
    const n = ctx.createBufferSource();
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = b;
    const nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 600;
    const ng = ctx.createGain(); ng.gain.value = 0.18;
    n.connect(nf).connect(ng).connect(this.sfx); n.start(t);
  }

  /** Board clear: chord plus shimmer. */
  chord(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.05;
    const stem = AUDIO_CATALOG[this.chapter]?.chordStem;
    if (stem) {
      void this.buffer(stem).then((b) => { if (!b || !this.ctx) return; const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.sfx); s.start(); });
      return;
    }
    [0, 4, 7, 11, 14].forEach((iv, i) => this.note(this.root + iv, t + i * 0.035, 2.6, 0.12, "triangle", 0.9));
    this.note(this.root - 12, t, 2.8, 0.14, "sine", 0.5);
    for (let i = 0; i < 10; i++) this.note(this.scale(15 + (i % 5) + Math.floor(i / 5) * 5), t + 0.18 + i * 0.07, 0.5, 0.035, "sine", 1);
  }

  /** Star landing tick, rising. */
  tick(i: number): void {
    if (!this.ctx || this.muted) return;
    this.note(this.scale(10 + i * 2), this.ctx.currentTime, 0.35, 0.12, "sine", 0.6);
  }

  fail(): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [0, -5, -9].forEach((iv, i) => this.note(this.root - 12 + iv + 12, t + i * 0.12, 0.9, 0.08, "sine", 0.7));
  }

  ui(): void {
    if (!this.ctx || this.muted) return;
    this.note(this.scale(13), this.ctx.currentTime, 0.12, 0.05, "sine", 0.2);
  }
}
