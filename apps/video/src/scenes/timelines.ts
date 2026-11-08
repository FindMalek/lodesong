import { beat } from "../design/beat";
import { T as OPEN_WIDE } from "./open-timeline";

export interface Shot {
  id: string;
  beats: number;
}

/** Shot boundaries follow the score's sections (audio-cues.ts): the cuts land on its hits. */
export const HERO_SHOTS: readonly Shot[] = [
  { id: "open", beats: 16 },
  { id: "keys", beats: 10 },
  { id: "mixes", beats: 10 },
  { id: "session", beats: 10 },
  { id: "terminal", beats: 8 },
  { id: "end", beats: 6 },
];

export const CUT_SHOTS: readonly Shot[] = [
  { id: "open", beats: 18 },
  { id: "session", beats: 7 },
  { id: "end", beats: 5 },
];

export function starts(shots: readonly Shot[]): Record<string, number> {
  const out: Record<string, number> = {};
  let at = 0;
  for (const shot of shots) {
    out[shot.id] = beat(at);
    at += shot.beats;
  }
  return out;
}

export const frames = (shots: readonly Shot[]): number => beat(shots.reduce((sum, shot) => sum + shot.beats, 0));

export interface OpenTimeline {
  music: number;
  server: number;
  label: number;
  headlineOut: number;
  chip: number;
  press: number;
  ignite: number;
  advance: number;
  cut: number;
  lift: number;
  end: number;
  scroll?: readonly number[];
}

export const OPEN: { wide: OpenTimeline; tall: OpenTimeline } = {
  wide: OPEN_WIDE,
  tall: {
    music: 0,
    server: 1,
    label: 0.75,
    headlineOut: 4.25,
    chip: 5,
    press: 7,
    ignite: 9,
    advance: 11,
    scroll: [13, 15, 17],
    cut: 18,
    lift: 18,
    end: 18,
  },
};

export const KEYS = { chord: 1, type: 1.25, enter: 3, cut: 4.75, caption: 4.75, sheet: 5, rows: 5, end: 10 } as const;

export const MIXES = { cover: 0, merge: 2, mergeEnd: 3, caption: 4, chip: 3, row: 5, rowEnd: 7, ignite: 9, end: 10 } as const;

export const SESSION = {
  wide: { windows: 0, phone: 0.5, picker: 1, caption: 2, select: 3, flyEnd: 4, chips: 4, end: 10 },
  tall: { windows: 0, phone: 0.5, picker: 0.25, caption: 0.25, select: 1, flyEnd: 2, chips: 2, end: 7 },
} as const;

export const TERMINAL = { caption: 0, type: 0.5, enter: 3, again: 5.25, pause: 7, end: 8 } as const;

export const END = {
  wide: { orb: 0.5, mark: 1, song: 1.5, tagline: 1.5, lines: 1.5, url: 2, end: 6 },
  tall: { orb: 1, mark: 2, song: 2.5, tagline: 0.5, lines: 0, url: 3, end: 5 },
} as const;

export const LOOP = { lyrics: 0, ignite: 3, advance: 5, mixes: 10, end: 20 } as const;
