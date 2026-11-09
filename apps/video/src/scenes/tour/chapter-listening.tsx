import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const LISTENING: ChapterSpec = {
  hosts: {
    stats: { focus: [0.05, 0.1, 0.9, 0.5] },
    recap: { focus: "card" },
    "recap-card": { focus: "card", push: 1.3 },
    moments: { plates: ["saved", "moments"], focus: "toast" },
  },
};

export function ListeningChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="listening" spec={LISTENING} previous={previous} />;
}
