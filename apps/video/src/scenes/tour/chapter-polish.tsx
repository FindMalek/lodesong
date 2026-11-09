import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const POLISH: ChapterSpec = {
  hosts: {
    login: { focus: [0.3, 0.2, 0.4, 0.6] },
  },
};

export function PolishChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="polish" spec={POLISH} previous={previous} />;
}
