import type { Song } from "./types";

// Pure data and maths; the filters live in the deck graph (decks.ts).

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const MAX_DB = 12;

export const PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "bass boost": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  "treble boost": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  loudness: [5, 3, 0, -1, -1, 0, 1, 3, 4, 3],
  acoustic: [4, 4, 3, 1, 1, 1, 3, 3, 3, 2],
  "late night": [3, 2, 0, -1, -2, -1, 0, 2, 3, 3],
};

export const FLAT = PRESETS.flat as number[];

export function clampGains(gains: unknown): number[] {
  const list = Array.isArray(gains) ? gains : [];
  return BANDS.map((_, index) => {
    const value = Number(list[index]);
    return Number.isFinite(value) ? Math.max(-MAX_DB, Math.min(MAX_DB, value)) : 0;
  });
}

export function presetOf(gains: number[]): string | null {
  return Object.entries(PRESETS).find(([, preset]) => preset.every((value, index) => value === gains[index]))?.[0] ?? null;
}

/** Linear gain that keeps boosted bands from clipping: the loudest boost, taken off the whole signal. */
export function headroom(gains: number[]): number {
  return 10 ** (-Math.max(0, ...gains) / 20);
}

export const fromDb = (db: number): number => 10 ** (db / 20);

const MAX_REPLAY_DB = 24;
const MIN_PEAK_LIMIT = 1 / 8;

/** The linear gain a song's ReplayGain tags ask for. A bad tag (not a number, 200 dB, a peak of a billion) can't silence a song or blast it. */
export function replayGainFactor(tags: NonNullable<Song["replayGain"]> | undefined, album: boolean): number {
  if (!tags) return 1;
  const db = album ? (tags.albumGain ?? tags.trackGain) : (tags.trackGain ?? tags.albumGain);
  const peak = album ? (tags.albumPeak ?? tags.trackPeak) : (tags.trackPeak ?? tags.albumPeak);
  if (typeof db !== "number" || !Number.isFinite(db)) return 1;
  const factor = fromDb(Math.max(-MAX_REPLAY_DB, Math.min(MAX_REPLAY_DB, db)));
  return typeof peak === "number" && peak > 0 ? Math.min(factor, Math.max(1 / peak, MIN_PEAK_LIMIT)) : factor;
}
