import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const KEYS: ChapterSpec = {
  hosts: {
    "kb-chords": { plates: ["albums", "artists", "stats"], push: 1.04, bare: true },
    "kb-transport": { lane: "tl" },
  },
};

export function KeysChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="keys" spec={KEYS} previous={previous} />;
}
