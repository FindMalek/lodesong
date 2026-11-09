import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const PLAYBACK: ChapterSpec = { hosts: {} };

export function PlaybackChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="playback" spec={PLAYBACK} previous={previous} />;
}
