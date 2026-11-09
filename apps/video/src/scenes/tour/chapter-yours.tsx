import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const YOURS: ChapterSpec = {
  hosts: {
    "tokens-api": { focus: [0.35, 0.28, 0.42, 0.12], push: 1.8 },
    "share-og": { push: 1.03, bare: true },
  },
};

export function YoursChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="yours" spec={YOURS} previous={previous} />;
}
