import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LIBRARY: ChapterSpec = { hosts: {} };

export function LibraryChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="library" spec={LIBRARY} previous={previous} />;
}
