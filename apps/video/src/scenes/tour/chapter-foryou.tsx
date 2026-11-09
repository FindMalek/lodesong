import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const FORYOU: ChapterSpec = { hosts: {} };

export function ForyouChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="foryou" spec={FORYOU} previous={previous} />;
}
