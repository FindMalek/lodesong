import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const INTAKE: ChapterSpec = { hosts: {} };

export function IntakeChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="intake" spec={INTAKE} previous={previous} />;
}
