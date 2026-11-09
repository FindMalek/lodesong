import { gridBeat as beat } from "../design/beat";

export const FRAMES = beat(16);

/** Every event of the scene, in beats. The visuals, the score and the checks all read this one table. */
export const T = {
  music: 1,
  server: 2,
  label: 2,
  headlineOut: 5.5,
  chip: 6,
  press: 7,
  ignite: 9,
  advance: 11,
  cut: 12,
  lift: 13,
  end: 16,
} as const;

const SETTLE = 1;
export const LABEL_FADE = 0.5;

type Voice = "tick" | "kick" | "hat" | "sub" | "whoosh" | "riser" | "click" | "bloom" | "soft";

export interface Cue {
  at: number;
  voice: Voice;
  ui?: boolean;
  detect?: boolean;
  length?: number;
}

const every = (from: number, to: number, step: number): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export const CUES: readonly Cue[] = [
  { at: 0, voice: "tick" },
  { at: T.music, voice: "tick", detect: true },
  { at: T.server, voice: "tick", detect: true },
  { at: 4, voice: "riser", length: 2 },
  ...every(4.5, 15.5, 1).map((at): Cue => ({ at, voice: "hat" })),
  ...every(6, 15, 1).map((at): Cue => ({ at, voice: "kick", detect: at % 4 === 0 })),
  { at: T.chip, voice: "sub" },
  { at: T.chip, voice: "whoosh" },
  { at: T.press, voice: "click", ui: true, detect: true },
  { at: T.ignite, voice: "bloom", ui: true, detect: true },
  { at: T.advance, voice: "soft", ui: true },
  { at: T.cut, voice: "sub", detect: true },
  { at: T.cut, voice: "whoosh" },
  { at: T.lift, voice: "click", ui: true, detect: true },
];

export interface TextItem {
  id: string;
  words: number;
  from: number;
  to: number;
}

export const TEXT_ITEMS: readonly TextItem[] = [
  { id: "your music.", words: 2, from: T.music + SETTLE, to: T.headlineOut },
  { id: "your server.", words: 2, from: T.server + SETTLE, to: T.headlineOut },
  { id: "self-hosted music player", words: 3, from: T.label + LABEL_FADE, to: T.headlineOut },
  { id: "synced lyrics", words: 2, from: T.chip + SETTLE, to: T.cut },
  { id: "lyric line", words: 4, from: T.press + SETTLE, to: T.cut },
];

/** Hold rule: 0.5 s plus 0.3 s per word, counted from fully visible. */
export const holdSeconds = (words: number): number => 0.5 + 0.3 * words;

export const KEYFRAMES = [1.5, 3.5, 6.5, 8, 10, 12.5, 14, 15.9].map((b) => beat(b));
export const HERO_FRAMES = [beat(8), beat(10)];
export const SETTLED_FRAMES = [beat(14), beat(15.9)];
