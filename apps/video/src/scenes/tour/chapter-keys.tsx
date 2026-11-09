import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const KEYS: ChapterSpec = { hosts: {} };

export function KeysChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="keys" spec={KEYS} previous={previous} />;
}
