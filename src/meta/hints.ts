import type { PlatformAdapter } from "../platform/PlatformAdapter.ts";
import type { Progress } from "./progress.ts";

/** Hint economy. Start 3; +1 per 3-star clear; +1 per Daily Light; rewarded-ad slot ready. */
export class HintEconomy {
  constructor(private readonly progress: Progress, private readonly platform: PlatformAdapter) {}

  get count(): number { return this.progress.data.hints; }

  spend(): boolean {
    if (this.progress.data.hints <= 0) return false;
    this.progress.data.hints--;
    void this.progress.save();
    return true;
  }

  grant(n = 1): void {
    this.progress.data.hints += n;
    void this.progress.save();
  }

  /** Rewarded-ad hook. Platforms that support ads resolve true and grant a hint. */
  async adSlot(slot: "hint"): Promise<boolean> {
    const ok = await this.platform.rewarded(slot);
    if (ok) this.grant(1);
    return ok;
  }
}
