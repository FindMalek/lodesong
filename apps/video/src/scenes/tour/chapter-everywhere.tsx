import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const EVERYWHERE: ChapterSpec = { hosts: {} };

export function EverywhereChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="everywhere" spec={EVERYWHERE} previous={previous} />;
}
