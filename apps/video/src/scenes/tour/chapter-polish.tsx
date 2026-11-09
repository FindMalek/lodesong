import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const POLISH: ChapterSpec = { hosts: {} };

export function PolishChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="polish" spec={POLISH} previous={previous} />;
}
