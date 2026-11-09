import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const YOURS: ChapterSpec = {
  hosts: {
    "tokens-api": { focus: [0.5, 0.55, 0.4, 0.2] },
    "share-og": { push: 1.03, bare: true },
  },
};

export function YoursChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="yours" spec={YOURS} previous={previous} />;
}
