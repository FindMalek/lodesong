import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const YOURS: ChapterSpec = { hosts: {} };

export function YoursChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="yours" spec={YOURS} previous={previous} />;
}
