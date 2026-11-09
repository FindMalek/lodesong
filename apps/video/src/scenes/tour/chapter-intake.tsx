import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const INTAKE: ChapterSpec = {
  hosts: {
    "ai-playlist": { plates: ["dialog", "typed", "made", "playlist"], focus: "dialog" },
    upload: { plates: ["dropped"], focus: [0.1, 0.1, 0.8, 0.5] },
    doctor: { plates: ["doctor", "fixed"], focus: "health" },
    "doctor-fix": { plates: ["fixed"], focus: "fix" },
    "genres-inferred": { focus: [0.14, 0.05, 0.6, 0.28], push: 1.2 },
  },
};

export function IntakeChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="intake" spec={INTAKE} previous={previous} />;
}
