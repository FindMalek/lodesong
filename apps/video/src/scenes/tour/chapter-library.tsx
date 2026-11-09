import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LIBRARY: ChapterSpec = {
  hosts: {
    "aura-backdrop": { focus: "active", bare: true, lane: "tl" },
    themes: { focus: [0.36, 0.2, 0.42, 0.3], push: 1.8 },
    genres: { focus: [0.1, 0.05, 0.8, 0.12], push: 1.6 },
  },
};

export function LibraryChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="library" spec={LIBRARY} previous={previous} />;
}
