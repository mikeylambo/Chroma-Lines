import { CAMPAIGN_LENGTH } from "../content/curveSpec.ts";
import type { PlatformAdapter } from "../platform/PlatformAdapter.ts";

export interface Settings {
  muted: boolean;
  colorAssist: boolean;
  haptics: boolean;
}

export interface SaveData {
  /** Highest level reached (campaign 1..60, endless 61+). */
  unlocked: number;
  /** Level currently being played (resume target). */
  current: number;
  stars: Record<number, number>;
  hints: number;
  daily: { lastKey: string | null; lastPlayedKey: string | null; streak: number; best: number };
  settings: Settings;
  seen: { aha: boolean; passClears: number };
}

export const DEFAULT_SAVE: SaveData = {
  unlocked: 1,
  current: 1,
  stars: {},
  hints: 3,
  daily: { lastKey: null, lastPlayedKey: null, streak: 0, best: 0 },
  settings: { muted: false, colorAssist: false, haptics: true },
  seen: { aha: false, passClears: 0 },
};

/** Fill any fields missing from older saves with defaults (never drop player state). */
export function normalizeSave(raw: Partial<SaveData> | null): SaveData {
  const d = structuredClone(DEFAULT_SAVE);
  if (!raw || typeof raw !== "object") return d;
  return {
    ...d,
    ...raw,
    daily: { ...d.daily, ...(raw.daily ?? {}) },
    settings: { ...d.settings, ...(raw.settings ?? {}) },
    seen: { ...d.seen, ...(raw.seen ?? {}) },
    stars: { ...(raw.stars ?? {}) },
  };
}

export function starsFor(mistakes: number): number {
  return mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
}

export class Progress {
  data: SaveData = structuredClone(DEFAULT_SAVE);
  private saving: Promise<void> = Promise.resolve();
  private readonly platform: PlatformAdapter;
  constructor(platform: PlatformAdapter) { this.platform = platform; }

  async load(): Promise<void> {
    try { this.data = normalizeSave(await this.platform.load<SaveData>()); } catch { this.data = structuredClone(DEFAULT_SAVE); }
  }

  save(): Promise<void> {
    const snapshot = structuredClone(this.data);
    this.saving = this.saving.then(() => this.platform.save(snapshot)).catch(() => undefined);
    return this.saving;
  }

  /** Records a campaign/endless clear. Returns hints earned. */
  recordClear(level: number, stars: number): number {
    const prev = this.data.stars[level] ?? 0;
    if (stars > prev) this.data.stars[level] = stars;
    this.data.unlocked = Math.max(this.data.unlocked, level + 1);
    this.data.current = level + 1;
    const earned = stars === 3 ? 1 : 0;
    this.data.hints += earned;
    return earned;
  }

  totalStars(): number {
    let n = 0;
    for (let i = 1; i <= CAMPAIGN_LENGTH; i++) n += this.data.stars[i] ?? 0;
    return n;
  }
}
