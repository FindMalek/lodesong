import { z } from "zod";
import type { Profile, Range } from "./vibes";

export interface Sound {
  energy: number;
  valence: number;
  bpm: number;
}

export const FIT_REASONS = ["name", "loud", "quiet", "steady", "fast", "slow", "bright", "dark"] as const;
export const fitReasonSchema = z.enum(FIT_REASONS);
export type FitReason = (typeof FIT_REASONS)[number];

export interface Fit {
  score: number;
  reasons: FitReason[];
}

const MARGIN: Record<keyof Profile, number> = { energy: 0.2, valence: 0.2, bpm: 30 };
const KEYS = Object.keys(MARGIN) as (keyof Profile)[];
const DESCRIBE_FROM = 0.75;
const MIN_SCORE = 0.65;
const MIN_ANALYSED = 3;
const MIN_COVERAGE = 0.5;

const close = (value: number, [low, high]: Range, margin: number) => Math.max(0, 1 - Math.max(low - value, value - high, 0) / margin);

const constrained = (profile: Profile) => KEYS.flatMap((key) => (profile[key] ? [{ key, range: profile[key] as Range }] : []));

/** Every feature has to fit: a fast song that isn't loud is no gym song. */
export function songFit(profile: Profile, song: Sound): number {
  return constrained(profile).reduce((fit, { key, range }) => fit * close(song[key], range, MARGIN[key]), 1);
}

function wordOf(key: keyof Profile, [low, high]: Range): FitReason | null {
  const middle = (low + high) / 2;
  if (key === "bpm") return low >= 100 ? "fast" : high <= 105 ? "slow" : null;
  if (key === "valence") return middle >= 0.6 ? "bright" : middle <= 0.4 ? "dark" : null;
  return middle >= 0.6 ? "loud" : middle <= 0.4 ? "quiet" : "steady";
}

export function playlistFit(profile: Profile, songs: Sound[]): Fit {
  if (!songs.length) return { score: 0, reasons: [] };
  const score = songs.reduce((sum, song) => sum + songFit(profile, song), 0) / songs.length;
  const reasons = constrained(profile).flatMap(({ key, range }) => {
    const average = songs.reduce((sum, song) => sum + song[key], 0) / songs.length;
    const word = wordOf(key, range);
    return word && close(average, range, MARGIN[key]) >= DESCRIBE_FROM ? [word] : [];
  });
  return { score, reasons };
}

export function fitsSound(fit: Fit, analysed: number, total: number): boolean {
  return analysed >= Math.min(MIN_ANALYSED, total) && analysed / total >= MIN_COVERAGE && fit.score >= MIN_SCORE;
}
