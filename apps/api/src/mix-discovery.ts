import type { Features } from "./audiomuse";
import { roundRobin } from "./mix-pool";
import { rankByTaste, tasteOf } from "./mix-scoring";
import type { Listening } from "./mixes";
import type { StatsSong as Song } from "./stats";

const FAMILIAR_MIN = 0.4;
const FAMILIAR_MAX = 0.85;
const FAMILIAR_PLAYS_PER_SONG = 5;
export const FAMILIAR_WINDOW_DAYS = 30;
const LANE_SHARE = 0.5;
const LANE_JITTER = 0.2;
const SOUND_TASTE = 0.1;

type Candidate = { song: Song; key: string; artist: string };

/** `recent` is the plays of each song in the last 30 days. Someone who replays the same songs gets mostly songs they know; someone who never repeats gets mostly new ones. */
export function familiarShare(recent: Map<string, number>): number {
  let plays = 0;
  for (const count of recent.values()) plays += Math.min(count, FAMILIAR_PLAYS_PER_SONG);
  const repeated = plays ? 1 - recent.size / plays : 0;
  return FAMILIAR_MIN + (FAMILIAR_MAX - FAMILIAR_MIN) * repeated;
}

const distance = (a: Features, b: Features) => Math.hypot(a.energy - b.energy, a.valence - b.valence, a.danceability - b.danceability);

function centre(l: Listening, artists: string[]): Features | null {
  const found = artists.flatMap((artist) => l.sounds.get(artist) ?? []).filter((entry) => l.playedKeys.has(entry.key));
  if (!found.length) return null;
  const mean = (pick: (features: Features) => number) => found.reduce((sum, entry) => sum + pick(entry.features), 0) / found.length;
  return { bpm: 0, key: "", energy: mean((f) => f.energy), valence: mean((f) => f.valence), danceability: mean((f) => f.danceability) };
}

/** Unplayed songs nearest the mix in sound; the ones you skip are left out and the ones you like count as a little nearer. */
function bySound(l: Listening, artists: string[], random: () => number): Candidate[] {
  const middle = centre(l, artists);
  if (!middle) return [];
  const inside = new Set(artists);
  const scored: (Candidate & { far: number })[] = [];
  for (const [artist, entries] of l.sounds) {
    if (inside.has(artist)) continue;
    for (const { song, key, features } of entries) {
      if (l.playedKeys.has(key)) continue;
      const taste = tasteOf(l, key);
      if (taste < 0) continue;
      scored.push({ song, key, artist, far: distance(middle, features) + LANE_JITTER * random() - SOUND_TASTE * taste });
    }
  }
  return scored.sort((a, b) => a.far - b.far);
}

function pickSound(sound: Candidate[], room: number, cap: number, avoid: Set<string>): { songs: Song[]; taken: Map<string, number> } {
  const taken = new Map<string, number>();
  const songs: Song[] = [];
  for (const entry of [...sound.filter((item) => !avoid.has(item.key)), ...sound.filter((item) => avoid.has(item.key))]) {
    if (songs.length >= room) break;
    if ((taken.get(entry.artist) ?? 0) >= cap) continue;
    taken.set(entry.artist, (taken.get(entry.artist) ?? 0) + 1);
    songs.push(entry.song);
  }
  return { songs, taken };
}

function byCompany(l: Listening, artists: string[], room: number, keyOf: (song: Song) => string, random: () => number) {
  const inside = new Set(artists);
  const strength = new Map<string, number>();
  for (const artist of artists)
    for (const [other, count] of l.together.get(artist) ?? [])
      if (!inside.has(other)) strength.set(other, (strength.get(other) ?? 0) + count);
  return [...strength.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([artist]) => ({ artist, songs: (l.byArtist.get(artist) ?? []).filter((song) => !l.playedKeys.has(keyOf(song))) }))
    .filter((entry) => entry.songs.length)
    .slice(0, room)
    .map((entry) => ({ artist: entry.artist, songs: rankByTaste(entry.songs, keyOf, l, random) }));
}

/** Songs you never played by artists outside the mix: the nearest in sound once AudioMuse has analysed the library, topped up with the ones played next to the mix. */
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
  const { songs: picked, taken } = pickSound(bySound(l, artists, random), room, cap, avoid);
  if (picked.length >= room) return picked;
  const have = new Set(picked.map(keyOf));
  const company = byCompany(l, artists, room, keyOf, random).map((entry) => {
    const songs = entry.songs.filter((song) => !have.has(keyOf(song)));
    return {
      artist: entry.artist,
      songs: [...songs.filter((song) => !avoid.has(keyOf(song))), ...songs.filter((song) => avoid.has(keyOf(song)))],
    };
  });
  const more = roundRobin(
    company.map((entry) => entry.songs),
    room - picked.length,
    cap,
    company.map((entry) => taken.get(entry.artist) ?? 0),
  );
  return [...picked, ...more];
}
