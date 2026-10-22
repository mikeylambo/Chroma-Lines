export interface PlatformAdapter {
  readonly id: "web" | "youtube";
  init(): Promise<void>;
  /** First frame interactive. */
  gameReady(): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onAudioToggle(cb: (enabled: boolean) => void): void;
  save(data: unknown): Promise<void>;
  load<T>(): Promise<T | null>;
  submitScore(score: number): void;
  /** Rewarded ad hook. Resolves true if the reward should be granted. */
  rewarded(slot: string): Promise<boolean>;
}
