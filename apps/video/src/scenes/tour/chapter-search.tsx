import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const SEARCH: ChapterSpec = { hosts: {} };

export function SearchChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="search" spec={SEARCH} previous={previous} />;
}
