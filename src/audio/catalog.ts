// Per-chapter musical identity. Stems are optional: drop a URL in and the engine plays it
// instead of the synthesized layer — no code changes needed.

export interface ChapterAudio {
  /** MIDI root note for the board key. */
  root: number;
  /** Optional replacement for the ambient pad (looped). */
  padStem?: string;
  /** Optional replacement for the board-clear chord. */
  chordStem?: string;
}

export const AUDIO_CATALOG: Record<number, ChapterAudio> = {
  0: { root: 62 }, // Daily Light — D
  1: { root: 60 }, // First Light — C
  2: { root: 62 }, // Chroma — D
  3: { root: 57 }, // Silhouettes — A
  4: { root: 64 }, // Tri — E
  5: { root: 55 }, // Long Light — G
  6: { root: 61 }, // Prism — C#
  7: { root: 59 }, // Endless — B
};

/** Major pentatonic degrees in semitones. */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;
