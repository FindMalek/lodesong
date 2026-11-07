import type { Features } from "./audiomuse";
import { roundRobin } from "./mix-pool";
import { rankByTaste } from "./mix-scoring";
import type { Listening } from "./mixes";
import type { StatsSong as Song } from "./stats";

const FAMILIAR_MIN = 0.4;
const FAMILIAR_MAX = 0.85;
const LANE_SHARE = 0.5;
const LANE_JITTER = 0.2;

/** Someone who plays the same songs again and again gets mostly songs they know; someone who never repeats gets mostly new ones. */
export function familiarShare(l: Listening): number {
  let plays = 0;
  let songs = 0;
  for (const signal of l.signals.values())
    if (signal.plays) {
      plays += signal.plays;
      songs++;
    }
  const repeated = plays ? 1 - songs / plays : 0;
  return FAMILIAR_MIN + (FAMILIAR_MAX - FAMILIAR_MIN) * repeated;
}

const distance = (a: Features, b: Features) => Math.hypot(a.energy - b.energy, a.valence - b.valence, a.danceability - b.danceability);

function centre(l: Listening, artists: string[]): Features | null {
  const found = artists.flatMap((artist) => l.sounds.get(artist) ?? []).filter((entry) => l.playedKeys.has(entry.key));
  if (!found.length) return null;
  const mean = (pick: (features: Features) => number) => found.reduce((sum, entry) => sum + pick(entry.features), 0) / found.length;
  return { bpm: 0, key: "", energy: mean((f) => f.energy), valence: mean((f) => f.valence), danceability: mean((f) => f.danceability) };
}

function bySound(l: Listening, artists: string[], random: () => number): { song: Song; key: string; artist: string }[] {
  const middle = centre(l, artists);
  if (!middle) return [];
  const inside = new Set(artists);
  const scored: { song: Song; key: string; artist: string; far: number }[] = [];
  for (const [artist, entries] of l.sounds) {
    if (inside.has(artist)) continue;
    for (const { song, key, features } of entries)
      if (!l.playedKeys.has(key)) scored.push({ song, key, artist, far: distance(middle, features) + LANE_JITTER * random() });
  }
  return scored.sort((a, b) => a.far - b.far);
}

function byCompany(l: Listening, artists: string[], room: number, keyOf: (song: Song) => string, random: () => number): Song[][] {
  const inside = new Set(artists);
  const strength = new Map<string, number>();
  for (const artist of artists)
    for (const [other, count] of l.together.get(artist) ?? [])
      if (!inside.has(other) && l.byArtist.has(other)) strength.set(other, (strength.get(other) ?? 0) + count);
  return [...strength.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, room)
    .map(([artist]) =>
      rankByTaste(
        (l.byArtist.get(artist) ?? []).filter((song) => !l.playedKeys.has(keyOf(song))),
        keyOf,
        l,
        random,
      ),
    )
    .filter((songs) => songs.length);
}

/** Songs you never played by artists outside the mix: the nearest in sound when AudioMuse has analysed the library, else the ones played next to the mix. */
export function discoveryLane(
  l: Listening,
  artists: string[],
  left: number,
  cap: number,
  keyOf: (song: Song) => string,
  avoid: Set<string>,
  random: () => number,
): Song[] {
  const room = Math.round(left * LANE_SHARE);
  const sound = bySound(l, artists, random);
  if (!sound.length) {
    const queues = byCompany(l, artists, room, keyOf, random).map((all) => {
      const songs = all.slice(0, cap * 3);
      return [...songs.filter((song) => !avoid.has(keyOf(song))), ...songs.filter((song) => avoid.has(keyOf(song)))];
    });
    return roundRobin(
      queues,
      room,
      cap,
      queues.map(() => 0),
    );
  }
  const taken = new Map<string, number>();
  const picked: Song[] = [];
  for (const entry of [...sound.filter((item) => !avoid.has(item.key)), ...sound.filter((item) => avoid.has(item.key))]) {
    if (picked.length >= room) break;
    if ((taken.get(entry.artist) ?? 0) >= cap) continue;
    taken.set(entry.artist, (taken.get(entry.artist) ?? 0) + 1);
    picked.push(entry.song);
  }
  return picked;
}
