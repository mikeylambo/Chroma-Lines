import type { PlatformAdapter } from "./PlatformAdapter.ts";
import { WebAdapter } from "./WebAdapter.ts";

// YouTube Playables adapter, following google/web-game-samples (SDK: https://www.youtube.com/game_api/v1,
// injected into index.html only for PLATFORM=youtube builds). Falls back to WebAdapter outside Playables.
interface YtGame {
  IN_PLAYABLES_ENV?: boolean;
  game: { firstFrameReady(): void; gameReady(): void; saveData(d: string): Promise<void>; loadData(): Promise<string> };
  system: { onPause(cb: () => void): void; onResume(cb: () => void): void; isAudioEnabled(): boolean; onAudioEnabledChange(cb: (on: boolean) => void): void };
  engagement: { sendScore(s: { value: number }): Promise<void> };
  ads?: { requestRewardedAd(id: string): Promise<boolean> };
  health?: { logError(): void; logWarning(): void };
}
const yt = (): YtGame | null => {
  const g = (globalThis as { ytgame?: YtGame }).ytgame;
  return g?.IN_PLAYABLES_ENV ? g : null;
};

export class YouTubeAdapter implements PlatformAdapter {
  readonly id = "youtube" as const;
  private readonly fallback = new WebAdapter();

  async init(): Promise<void> {
    const api = yt();
    if (!api) return this.fallback.init();
    api.game.firstFrameReady();
    window.addEventListener("error", () => api.health?.logError());
    window.addEventListener("unhandledrejection", () => api.health?.logError());
  }
  gameReady(): void { yt()?.game.gameReady(); }
  onPause(cb: () => void): void { const api = yt(); if (api) api.system.onPause(cb); else this.fallback.onPause(cb); }
  onResume(cb: () => void): void { const api = yt(); if (api) api.system.onResume(cb); else this.fallback.onResume(cb); }
  onAudioToggle(cb: (enabled: boolean) => void): void {
    const api = yt();
    if (!api) return;
    cb(api.system.isAudioEnabled());
    api.system.onAudioEnabledChange(cb);
  }
  async save(data: unknown): Promise<void> {
    const api = yt();
    if (api) await api.game.saveData(JSON.stringify(data)); else await this.fallback.save(data);
  }
  async load<T>(): Promise<T | null> {
    const api = yt();
    if (!api) return this.fallback.load<T>();
    const s = await api.game.loadData();
    return s ? (JSON.parse(s) as T) : null;
  }
  submitScore(score: number): void { void yt()?.engagement.sendScore({ value: Math.floor(score) }).catch(() => undefined); }
  async rewarded(slot: string): Promise<boolean> {
    const ads = yt()?.ads;
    if (!ads) return false;
    try { return await ads.requestRewardedAd(slot); } catch { return false; }
  }
}
