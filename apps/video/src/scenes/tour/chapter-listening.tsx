import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LISTENING: ChapterSpec = { hosts: {} };

export function ListeningChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="listening" spec={LISTENING} previous={previous} />;
}
