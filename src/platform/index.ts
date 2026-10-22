import type { PlatformAdapter } from "./PlatformAdapter.ts";
import { WebAdapter } from "./WebAdapter.ts";
import { YouTubeAdapter } from "./YouTubeAdapter.ts";

declare const __PLATFORM__: string;

export function createPlatform(): PlatformAdapter {
  return __PLATFORM__ === "youtube" ? new YouTubeAdapter() : new WebAdapter();
}
export type { PlatformAdapter };
