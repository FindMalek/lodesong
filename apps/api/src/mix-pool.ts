import type { Listening } from "./mixes";

const POOL_ARTISTS = 15;
const HOP_FANOUT = 5;
const HOP_DECAY = 0.5;
export const ARTIST_CAP = 0.2;

function nextTo(l: Listening, artist: string): [string, number][] {
  const row = [...(l.together.get(artist) ?? new Map<string, number>()).entries()]
    .filter(([other]) => l.byArtist.has(other))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, HOP_FANOUT);
  const best = row[0]?.[1] ?? 1;
  return row.map(([other, count]) => [other, count / best]);
}

/** The seed, then the artists around it: those it was played next to, and those next to them at a decaying weight. */
export function artistPool(l: Listening, seed: string): string[] {
  const weights = new Map<string, number>();
  const add = (artist: string, weight: number) => weights.set(artist, (weights.get(artist) ?? 0) + weight);
  const near = nextTo(l, seed);
  for (const [artist, weight] of near) add(artist, weight);
  for (const [artist, weight] of near) for (const [other, share] of nextTo(l, artist)) add(other, weight * share * HOP_DECAY);
  weights.delete(seed);
  const around = [...weights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(POOL_ARTISTS - 1, 0))
    .map(([artist]) => artist);
  return [seed, ...around];
}

/** One song from each queue in turn, so no artist takes a run of slots; an artist past `cap` waits for the top-up. */
export function roundRobin<T>(queues: T[][], size: number, cap: number, taken: number[]): T[] {
  const out: T[] = [];
  for (let moved = true; moved && out.length < size; ) {
    moved = false;
    for (const [index, queue] of queues.entries()) {
      if (out.length >= size) break;
      if ((taken[index] ?? 0) >= cap) continue;
      const song = queue.shift();
      if (song === undefined) continue;
      out.push(song);
      taken[index] = (taken[index] ?? 0) + 1;
      moved = true;
    }
  }
  return out;
}
