import { TelemetryRecorder } from "@slu/web-shell";
import type { LevelDef } from "./levels.ts";

export type GameEvent = "level_start" | "tap_free" | "tap_blocked" | "life_lost" | "hint_used" | "level_clear" | "level_fail" | "quit" | "daily_complete";

export class GameTelemetry {
  readonly recorder = new TelemetryRecorder({ context: { game: "chroma-lines" } });
  private startedAt = performance.now();
  private def: LevelDef | null = null;

  begin(def: LevelDef): void {
    this.def = def;
    this.startedAt = performance.now();
    this.emit("level_start");
  }

  emit(name: GameEvent, data: Record<string, number | string | boolean> = {}): void {
    const d = this.def;
    this.recorder.record(name, {
      level: d?.index ?? -1,
      kind: d?.kind ?? "none",
      chapter: d?.chapter ?? -1,
      seed: d?.seed ?? 0,
      elapsedMs: Math.round(performance.now() - this.startedAt),
      ...data,
    });
  }
}
