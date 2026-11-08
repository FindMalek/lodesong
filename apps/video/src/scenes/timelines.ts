import { beat } from "../design/beat";
import { T as OPEN_WIDE } from "./open-timeline";

export interface Shot {
  id: string;
  beats: number;
}

export const HERO_SHOTS: readonly Shot[] = [
  { id: "open", beats: 15 },
  { id: "mixes", beats: 10 },
  { id: "session", beats: 11 },
  { id: "keys", beats: 8 },
  { id: "terminal", beats: 8 },
  { id: "end", beats: 8 },
];

export const CUT_SHOTS: readonly Shot[] = [
  { id: "open", beats: 10 },
  { id: "mixes", beats: 7 },
  { id: "session", beats: 7 },
  { id: "end", beats: 6 },
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

export const OPEN = {
  wide: OPEN_WIDE,
  tall: {
    music: 0,
    server: 0.25,
    label: 0.25,
    headlineOut: 3.75,
    chip: 3.75,
    press: 5,
    ignite: 7,
    advance: 9,
    cut: 10,
    lift: 10,
    end: 10,
  },
} as const;

export const MIXES = {
  wide: { cover: 0, merge: 3, mergeEnd: 4.5, caption: 5, chip: 5, row: 6.5, rowEnd: 8, ignite: 9, end: 10 },
  tall: { cover: 0, merge: 1, mergeEnd: 2, caption: 2, chip: 3, row: 3, rowEnd: 4.5, ignite: 5, end: 7 },
} as const;

export const SESSION = {
  wide: { windows: 0, phone: 1, caption: 2, picker: 3, select: 5, flyEnd: 6.5, chips: 6, end: 11 },
  tall: { windows: 0, phone: 0.5, caption: 1, picker: 3, select: 5, flyEnd: 6.25, chips: 0, end: 7 },
} as const;

export const KEYS = { chord: 1, type: 1.25, enter: 3, cut: 4, caption: 4, sheet: 5, rows: 5.5, end: 8 } as const;

export const TERMINAL = { caption: 0, type: 0.25, enter: 3, end: 8 } as const;

export const END = {
  wide: { orb: 0.5, mark: 0.5, tagline: 1, lines: 1.5, url: 3, end: 8 },
  tall: { orb: 0.5, mark: 0.5, tagline: 1, lines: 1.5, url: 2.5, end: 6 },
} as const;

export const LOOP = { lyrics: 0, ignite: 3, advance: 5, mixes: 10, end: 20 } as const;

