import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const QUEUE: ChapterSpec = { hosts: {} };

export function QueueChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="queue" spec={QUEUE} previous={previous} />;
}
