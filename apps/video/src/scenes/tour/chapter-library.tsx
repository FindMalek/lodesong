import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LIBRARY: ChapterSpec = {
  hosts: {
    "aura-backdrop": { focus: "active", bare: true },
    themes: { focus: [0.28, 0.28, 0.45, 0.35], push: 1.5 },
  },
};

export function LibraryChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="library" spec={LIBRARY} previous={previous} />;
}
