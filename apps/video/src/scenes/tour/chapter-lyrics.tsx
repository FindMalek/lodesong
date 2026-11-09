import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LYRICS: ChapterSpec = {
  hosts: {
    "lyrics-synced": { focus: [0.75, 0.03, 0.25, 0.4], push: 1.7, lane: "br" },
    "lyrics-words": { plates: ["word-04-0", "word-04-1", "word-04-2", "word-04-3", "word-04-4", "word-04-5"], focus: "active", lane: "tl" },
    "lyrics-full": { plates: ["line-02"], focus: [0.3, 0.03, 0.6, 0.9], push: 1.1, bare: true, lane: "tl" },
    "lyrics-click-line": { focus: [0.38, 0.4, 0.36, 0.2], cursor: true },
    "lyrics-nudge": { plates: ["before", "after"], focus: "footer" },
    "lyrics-panel": { focus: [0.75, 0.03, 0.25, 0.4], push: 1.5, lane: "br" },
    "lyrics-sources": { focus: [0.38, 0.3, 0.45, 0.3], lane: "tl" },
    "lyrics-coverage": { focus: [0.05, 0.05, 0.9, 0.45] },
  },
};

export function LyricsChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="lyrics" spec={LYRICS} previous={previous} />;
}
