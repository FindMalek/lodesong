import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const POLISH: ChapterSpec = {
  hosts: {
    login: { focus: [0.37, 0.3, 0.26, 0.4], push: 1.6 },
    offline: { lane: "tl" },
    a11y: { focus: [0.08, 0.04, 0.5, 0.14], push: 1.8 },
  },
};

export function PolishChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="polish" spec={POLISH} previous={previous} />;
}
