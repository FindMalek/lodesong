import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LYRICS: ChapterSpec = { hosts: {} };

export function LyricsChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="lyrics" spec={LYRICS} previous={previous} />;
}
