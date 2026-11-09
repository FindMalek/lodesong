import { type ChapterProps, TourChapter } from "./engine";
import { chartLine } from "./flourish";
import type { ChapterSpec } from "./spec";

export const LISTENING: ChapterSpec = {
  hosts: {
    stats: { focus: [0.15, 0.1, 0.82, 0.4], push: 1.5, overlay: chartLine([0.15, 0.28, 0.82, 0.17], 3) },
    "stats-clock": { focus: [0.02, 0, 0.96, 0.35] },
    "stats-charts": { focus: [0.04, 0.12, 0.9, 0.3], push: 1.2 },
    recap: { focus: "card" },
    "recap-card": { focus: "card", push: 1.3 },
    moments: { plates: ["saved"], focus: "toast" },
  },
};

export function ListeningChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="listening" spec={LISTENING} previous={previous} />;
}
