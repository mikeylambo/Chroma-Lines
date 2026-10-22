import type { PlatformAdapter } from "./PlatformAdapter.ts";
import { WebAdapter } from "./WebAdapter.ts";

// YouTube Playables adapter. Same interface as WebAdapter; SDK calls are marked TODO
// until the Playables SDK script (https://www.youtube.com/game_api/v1) is wired in.
type YtGame = {
  firstFrameReady?: () => void;
  gameReady?: () => void;
  onPause?: (cb: () => void) => void;
  onResume?: (cb: () => void) => void;
  onAudioEnabledChange?: (cb: (enabled: boolean) => void) => void;
  saveData?: (data: string) => Promise<void>;
  loadData?: () => Promise<string>;
  sendScore?: (s: { value: number }) => Promise<void>;
};
const yt = (): YtGame | undefined => (globalThis as { ytgame?: { game?: YtGame; system?: YtGame; engagement?: YtGame } }).ytgame?.game;

export class YouTubeAdapter implements PlatformAdapter {
  readonly id = "youtube" as const;
  private readonly fallback = new WebAdapter();

  async init(): Promise<void> {
    // TODO(youtube): ytgame.game.firstFrameReady() once the first frame renders.
    yt()?.firstFrameReady?.();
    await this.fallback.init();
  }
  gameReady(): void { yt()?.gameReady?.(); } // TODO(youtube): confirm call site matches certification.
  onPause(cb: () => void): void { // TODO(youtube): ytgame.system.onPause
    (globalThis as { ytgame?: { system?: YtGame } }).ytgame?.system?.onPause?.(cb) ?? this.fallback.onPause(cb);
  }
  onResume(cb: () => void): void { // TODO(youtube): ytgame.system.onResume
    (globalThis as { ytgame?: { system?: YtGame } }).ytgame?.system?.onResume?.(cb) ?? this.fallback.onResume(cb);
  }
  onAudioToggle(cb: (enabled: boolean) => void): void { // TODO(youtube): ytgame.system.onAudioEnabledChange
    (globalThis as { ytgame?: { system?: YtGame } }).ytgame?.system?.onAudioEnabledChange?.(cb);
  }
  async save(data: unknown): Promise<void> { // TODO(youtube): ytgame.game.saveData (string, size-limited)
    const api = yt();
    if (api?.saveData) await api.saveData(JSON.stringify(data)); else await this.fallback.save(data);
  }
  async load<T>(): Promise<T | null> { // TODO(youtube): ytgame.game.loadData
    const api = yt();
    if (api?.loadData) { const s = await api.loadData(); return s ? (JSON.parse(s) as T) : null; }
    return this.fallback.load<T>();
  }
  submitScore(score: number): void { // TODO(youtube): ytgame.engagement.sendScore
    void (globalThis as { ytgame?: { engagement?: YtGame } }).ytgame?.engagement?.sendScore?.({ value: score });
  }
  async rewarded(_slot: string): Promise<boolean> { return false; } // TODO(youtube): rewarded ads when available
}
