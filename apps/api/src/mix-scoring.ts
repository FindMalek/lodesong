import type { Listening } from "./mixes";

const LIKE_POINTS = 3;
const REPLAY_POINTS = 0.6;
const SKIP_POINTS = 5;
const SKIPS_FOR_FULL_WEIGHT = 3;
const RECENCY_POINTS = 2;
const RECENCY_HALF_LIFE_DAYS = 14;
const JITTER = 0.5;
const DAY = 86_400_000;

export interface Signal {
  plays: number;
  skips: number;
  last: number;
}

/** Likes and replays lift a song, skips sink it, and one left alone for a while is due; the jitter keeps equals rotating. */
export function tasteOf(l: Listening, key: string): number {
  const signal = l.signals.get(key);
  const plays = signal?.plays ?? 0;
  const skips = signal?.skips ?? 0;
  const skipShare = plays + skips ? (skips / (plays + skips)) * Math.min(1, skips / SKIPS_FOR_FULL_WEIGHT) : 0;
  const rested = plays ? 1 - 0.5 ** ((l.now - (signal?.last ?? l.now)) / DAY / RECENCY_HALF_LIFE_DAYS) : 0;
  return (l.liked.has(key) ? LIKE_POINTS : 0) + REPLAY_POINTS * Math.log(1 + plays) - SKIP_POINTS * skipShare + RECENCY_POINTS * rested;
}

export function rankByTaste<T>(items: T[], keyOf: (item: T) => string, l: Listening, random: () => number): T[] {
  return items
    .map((item) => ({ item, score: tasteOf(l, keyOf(item)) + JITTER * random() }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
