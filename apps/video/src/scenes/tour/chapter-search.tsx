import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const SEARCH: ChapterSpec = {
  hosts: {
    "search-palette": { plates: ["palette-empty", "type-01", "type-02", "type-03"], focus: "input" },
    "search-lyric": { plates: ["type-04", "type-05", "type-06", "type-07", "type-08", "type-09", "results"], focus: "input" },
    "search-from-line": { plates: ["before", "after"], focus: "row1", cursor: true },
    "search-typos": { plates: ["typo", "no-spaces"], focus: "input" },
    "search-filters": { plates: ["filters", "is-liked"], focus: "input" },
  },
};

export function SearchChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="search" spec={SEARCH} previous={previous} />;
}
