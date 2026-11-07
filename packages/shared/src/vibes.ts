import { normalize } from "./normalize";

export interface Vibe {
  label: string;
  why: string;
  /** Search operators (bpm, energy, mood) for the songs that fit by AudioMuse features. */
  query: string;
  words: string[];
  names: string[];
  genres: string[];
}

export const VIBES: Vibe[] = [
  {
    label: "gym",
    why: "fast and loud",
    query: "energy:high bpm:110..",
    words: ["gym", "workout", "work out", "training", "exercise", "cardio", "running", "lifting", "entrainement"],
    names: ["gym", "workout", "training", "cardio", "running"],
    genres: ["electro", "electronic", "hip hop", "rap", "metal", "punk", "dance", "drum and bass", "dnb"],
  },
  {
    label: "melancholy",
    why: "dark and quiet",
    query: "mood:sad",
    words: ["melancholy", "melancholic", "sad", "heartbreak", "lonely", "gloomy", "triste", "melancolie"],
    names: ["melancholy", "sad", "blue", "heartbreak", "lonely", "gloom", "gloomy", "triste"],
    genres: ["blues", "folk", "indie", "shoegaze", "slowcore", "classical"],
  },
  {
    label: "rainy days",
    why: "low energy",
    query: "energy:low",
    words: ["rainy", "rain", "rainy day", "cozy", "pluie"],
    names: ["rain", "rainy", "cozy", "pluie"],
    genres: ["jazz", "ambient", "folk", "lo fi", "lofi", "acoustic"],
  },
  {
    label: "focus",
    why: "steady, no surprises",
    query: "energy:mid bpm:..120",
    words: ["focus", "study", "studying", "concentrate", "concentration", "coding", "work"],
    names: ["focus", "study", "concentration", "work", "deep work", "deep focus"],
    genres: ["ambient", "classical", "post rock", "instrumental", "lo fi", "lofi", "electro"],
  },
  {
    label: "late night",
    why: "slow and close",
    query: "energy:low bpm:..100",
    words: ["late night", "midnight", "after dark", "insomnia", "nuit"],
    names: ["late night", "midnight", "after dark", "nuit"],
    genres: ["jazz", "soul", "ambient", "trip hop", "downtempo", "r&b", "rnb"],
  },
  {
    label: "chill",
    why: "calm and warm",
    query: "mood:chill",
    words: ["chill", "chill out", "chillout", "relax", "relaxing", "calm", "unwind", "sleep", "sleepy", "lofi", "lo fi", "detente"],
    names: ["chill", "chill out", "chillout", "relax", "calm", "sleep", "unwind"],
    genres: ["ambient", "lo fi", "lofi", "downtempo", "jazz", "acoustic", "chillout", "chill out", "chill"],
  },
  {
    label: "party",
    why: "upbeat and danceable",
    query: "mood:upbeat bpm:110..",
    words: ["party", "dancing", "fete"],
    names: ["party", "dance", "club"],
    genres: ["dance", "house", "pop", "disco", "funk", "hip hop"],
  },
  {
    label: "happy",
    why: "bright and upbeat",
    query: "mood:upbeat",
    words: ["happy", "feel good", "heureux"],
    names: ["happy", "sunny", "summer", "feel good"],
    genres: ["pop", "funk", "disco", "reggae", "soul"],
  },
];

const LEAD = /^(?:(?:music|songs|playlist|mix)\s+)?for\s+(?:(?:the|a|some)\s+)?/;
const FILLER = /\s(?:mix|mixes|music|playlist|playlists|songs|vibes?)$/;
const PREFIX_MIN = 6;

/** Plurals fold ("workouts" is "workout"); every comparison here goes through it, vocabulary included. */
const stems = (text: string) =>
  normalize(text)
    .split(" ")
    .map((word) => word.replace(/s$/, ""))
    .join(" ");

/** "gym", "for the gym", "gym mix", "melanchol": the vibe the text names, or null. Exact words win over prefixes, which need 6 letters so "train" and "after" stay searches. */
export function vibeOf(text: string): Vibe | null {
  const wanted = stems(normalize(text).replace(LEAD, "").replace(FILLER, ""));
  if (!wanted) return null;
  const known = VIBES.map((vibe) => ({ vibe, words: vibe.words.map(stems) }));
  const exact = known.find(({ words }) => words.includes(wanted));
  if (exact) return exact.vibe;
  if (wanted.length < PREFIX_MIN) return null;
  return known.find(({ words }) => words.some((word) => word.startsWith(wanted)))?.vibe ?? null;
}

const hasWord = (value: string, entries: string[]) => {
  const have = ` ${stems(value)} `;
  return entries.some((entry) => have.includes(` ${stems(entry)} `));
};

export const fitsPlaylist = (vibe: Vibe, name: string) => hasWord(name, vibe.names);

export const fitsGenre = (vibe: Vibe, genre: string) => hasWord(genre, vibe.genres);
