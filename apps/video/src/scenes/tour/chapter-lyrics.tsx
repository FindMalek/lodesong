import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LYRICS: ChapterSpec = {
  hosts: {
    "lyrics-synced": { focus: [0.76, 0.06, 0.24, 0.5], push: 1.7 },
    "lyrics-words": { plates: ["word-04-0", "word-04-1", "word-04-2", "word-04-3", "word-04-4", "word-04-5"], focus: "active" },
    "lyrics-full": { plates: ["line-02"], focus: [0.3, 0.03, 0.6, 0.9], push: 1.1, bare: true },
    "lyrics-click-line": { focus: [0.25, 0.4, 0.55, 0.25], cursor: true },
    "lyrics-nudge": { plates: ["before", "after"], focus: "footer" },
    "lyrics-panel": { focus: [0.76, 0.03, 0.24, 0.6], push: 1.5 },
    "lyrics-sources": { focus: [0.3, 0.25, 0.6, 0.5] },
    "lyrics-coverage": { focus: [0, 0.02, 1, 0.5] },
  },
};

export function LyricsChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="lyrics" spec={LYRICS} previous={previous} />;
}
