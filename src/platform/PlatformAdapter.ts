export interface PlatformAdapter {
  readonly id: "web" | "youtube";
  init(): Promise<void>;
  /** The first real frame (the board) is on screen. */
  firstFrame(): void;
  /** First frame interactive. */
  gameReady(): void;
  /** Host UI language (BCP-47), e.g. "en", "pt-BR". */
  language(): string;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onAudioToggle(cb: (enabled: boolean) => void): void;
  save(data: unknown): Promise<void>;
  load<T>(): Promise<T | null>;
  submitScore(score: number): void;
  /** Rewarded ad hook. Resolves true if the reward should be granted. */
  rewarded(slot: string): Promise<boolean>;
}
