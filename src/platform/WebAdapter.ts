import { BrowserStorage, MemoryStorage, SaveManager, type StorageAdapter } from "@slu/web-shell";
import type { PlatformAdapter } from "./PlatformAdapter.ts";

export const SAVE_SCHEMA = 1;

function storage(): StorageAdapter {
  try {
    const probe = "__chroma_probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return new BrowserStorage("chroma-lines");
  } catch {
    return new MemoryStorage(); // private mode / blocked storage: play on, just don't persist
  }
}

export class WebAdapter implements PlatformAdapter {
  readonly id = "web" as const;
  private readonly saves = new SaveManager<unknown>(storage(), "save", SAVE_SCHEMA);
  private pauseCbs: (() => void)[] = [];
  private resumeCbs: (() => void)[] = [];

  async init(): Promise<void> {
    document.addEventListener("visibilitychange", () => {
      for (const cb of document.hidden ? this.pauseCbs : this.resumeCbs) cb();
    });
  }
  gameReady(): void { /* web: nothing to signal */ }
  onPause(cb: () => void): void { this.pauseCbs.push(cb); }
  onResume(cb: () => void): void { this.resumeCbs.push(cb); }
  onAudioToggle(_cb: (enabled: boolean) => void): void { /* web: in-game toggle only */ }
  async save(data: unknown): Promise<void> { await this.saves.save(data); }
  async load<T>(): Promise<T | null> {
    const r = await this.saves.loadWithRecovery();
    return r.data as T | null;
  }
  submitScore(_score: number): void { /* no leaderboard on plain web */ }
  async rewarded(_slot: string): Promise<boolean> { return false; }
}
