import { scheduledSeed } from "@slu/web-shell";
import type { Progress } from "./progress.ts";

/** Daily Light: one scored attempt per UTC day, with a streak. */
export class DailyLight {
  constructor(private readonly progress: Progress) {}

  get key(): string { return scheduledSeed("chroma-lines", "daily").key; }
  get streak(): number {
    const d = this.progress.data.daily;
    // Streak survives only if yesterday or today was completed.
    if (!d.lastKey) return 0;
    if (d.lastKey === this.key || d.lastKey === yesterdayKey()) return d.streak;
    return 0;
  }
  get completedToday(): boolean { return this.progress.data.daily.lastKey === this.key; }
  get attemptedToday(): boolean { return this.progress.data.daily.lastPlayedKey === this.key; }

  markAttempt(): void { this.progress.data.daily.lastPlayedKey = this.key; void this.progress.save(); }

  /** Returns hints earned. */
  complete(): number {
    const d = this.progress.data.daily;
    if (d.lastKey === this.key) return 0;
    d.streak = d.lastKey === yesterdayKey() ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.lastKey = this.key;
    this.progress.data.hints += 1;
    void this.progress.save();
    return 1;
  }
}

function yesterdayKey(): string {
  return scheduledSeed("chroma-lines", "daily", new Date(Date.now() - 86400000)).key;
}
