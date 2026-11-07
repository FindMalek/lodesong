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
    words: ["gym", "workout", "work out", "training", "exercise", "cardio", "running", "run", "lifting", "pump", "sport", "entrainement"],
    names: ["gym", "workout", "training", "cardio", "running", "run", "energy", "pump", "sport"],
    genres: ["electro", "hip hop", "rap", "metal", "punk", "dance", "drum"],
  },
  {
    label: "melancholy",
    why: "slow and low",
    query: "mood:sad",
    words: ["melancholy", "melancholic", "sad", "blue", "heartbreak", "lonely", "gloomy", "triste", "melancolie"],
    names: ["melancholy", "sad", "blue", "heartbreak", "lonely", "gloom", "triste"],
    genres: ["blues", "soul", "folk", "indie", "shoegaze", "slowcore", "classical"],
  },
  {
    label: "rainy days",
    why: "soft and slow",
    query: "energy:low",
    words: ["rainy", "rain", "rainy day", "cozy", "pluie"],
    names: ["rain", "cozy", "pluie"],
    genres: ["jazz", "ambient", "folk", "lo fi", "acoustic"],
  },
  {
    label: "focus",
    why: "steady, no surprises",
    query: "energy:mid bpm:..120",
    words: ["focus", "study", "studying", "concentrate", "concentration", "coding", "reading", "work"],
    names: ["focus", "study", "concentration", "work", "deep"],
    genres: ["ambient", "classical", "post rock", "instrumental", "lo fi", "electro"],
  },
  {
    label: "late night",
    why: "slow and close",
    query: "energy:low bpm:..100",
    words: ["late night", "midnight", "after dark", "insomnia", "nuit"],
    names: ["late night", "midnight", "after dark", "nuit"],
    genres: ["jazz", "soul", "ambient", "trip hop", "downtempo", "r b"],
  },
  {
    label: "chill",
    why: "calm and warm",
    query: "mood:chill",
    words: ["chill", "relax", "calm", "unwind", "sleep", "detente"],
    names: ["chill", "relax", "calm", "sleep", "unwind"],
    genres: ["ambient", "lo fi", "downtempo", "jazz", "acoustic", "chillout"],
  },
  {
    label: "party",
    why: "upbeat and danceable",
    query: "mood:upbeat bpm:110..",
    words: ["party", "dance", "club", "dancing", "fete"],
    names: ["party", "dance", "club"],
    genres: ["dance", "house", "pop", "disco", "funk", "hip hop"],
  },
  {
    label: "happy",
    why: "bright and upbeat",
    query: "mood:upbeat",
    words: ["happy", "sunny", "summer", "feel good", "joy", "heureux"],
    names: ["happy", "sunny", "summer", "feel good"],
    genres: ["pop", "funk", "disco", "reggae", "soul"],
  },
];

const FILLER = /\s(?:mix|music|playlist|playlists|songs|vibes?)$/;

/** "gym", "gym mix", "melan": the vibe the text names, or null. Prefixes need 4 letters so "run" never means "running". */
export function vibeOf(text: string): Vibe | null {
  const wanted = normalize(text)
    .replace(/^for\s+/, "")
    .replace(FILLER, "");
  if (!wanted) return null;
  return VIBES.find((vibe) => vibe.words.some((word) => word === wanted || (wanted.length >= 4 && word.startsWith(wanted)))) ?? null;
}

const startsAWord = (value: string, starts: string[]) => starts.some((start) => ` ${normalize(value)}`.includes(` ${start}`));

export const fitsPlaylist = (vibe: Vibe, name: string) => startsAWord(name, vibe.names);

export const fitsGenre = (vibe: Vibe, genre: string) => startsAWord(genre, vibe.genres);
