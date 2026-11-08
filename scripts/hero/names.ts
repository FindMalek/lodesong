import { ALBUM_WORDS, ARTISTS, TITLE_TAILS, TITLE_WORDS } from "../demo/catalog";

const MORE_ARTISTS = [
  "Glass Anthem",
  "Paper Satellites",
  "Moon Cartel",
  "Low Orchard",
  "Saint Lumen",
  "The Quiet Wires",
  "Harbor & Pine",
  "Neon Parish",
  "Ada Voss",
  "Juno Reyes",
  "Kite Season",
  "Mono Garden",
  "Elan Mirror",
  "Tessellate",
  "Wren Atlas",
  "Slow Cathedral",
  "Orchard Static",
  "Lumen Park",
  "Sable & Co",
  "Marguerite Cole",
  "Pale Transit",
  "Ghost Lantern",
  "The Long Weekend",
  "Oda Linden",
];
const ALBUM_TAILS = ["", " II", " III", " Live", " Sessions", " (Deluxe)"];
const LYRICS = [
  "I keep the lights on for you",
  "the quiet between the neon",
  "your name in the static",
  "we were never leaving",
  "hold the morning a little longer",
  "every window is a river",
  "say it slowly, say it twice",
  "carry me home through the rain",
  "a thousand small lanterns",
  "stay until the signal fades",
  "everything we left unsaid",
  "turn it up and let it ring",
];

const ARTIST_NAMES = [...ARTISTS.map((artist) => artist.name), ...MORE_ARTISTS];

export const idNumber = (id: string): number => Number.parseInt(id.replace(/\D/g, ""), 10) || 0;

export function artistName(id: string): string {
  const n = idNumber(id);
  const round = Math.floor(n / ARTIST_NAMES.length);
  return `${ARTIST_NAMES[n % ARTIST_NAMES.length]}${round ? ` ${round + 1}` : ""}`;
}

export function albumName(id: string): string {
  const n = idNumber(id);
  return `${ALBUM_WORDS[n % ALBUM_WORDS.length]}${ALBUM_TAILS[Math.floor(n / ALBUM_WORDS.length) % ALBUM_TAILS.length]}`;
}

export function songTitle(id: string): string {
  const n = idNumber(id);
  const word = (shift: number) => TITLE_WORDS[(n * 7 + shift * 5 + (n >> 3)) % TITLE_WORDS.length];
  return `${word(0)} ${word(1)}${TITLE_TAILS[n % TITLE_TAILS.length]}`;
}

export function lyricLine(seed: number, index: number): string {
  return LYRICS[(seed + index) % LYRICS.length] as string;
}

export const releaseYear = (id: string): number => 2008 + ((idNumber(id) * 7) % 18);
