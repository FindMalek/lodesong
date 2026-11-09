import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const INTAKE: ChapterSpec = {
  hosts: {
    "ai-playlist": { plates: ["dialog", "typed", "made", "playlist"], focus: "dialog" },
    upload: { plates: ["empty", "dropped"], focus: "drop" },
    doctor: { plates: ["doctor", "fixed"], focus: "health" },
    "doctor-fix": { plates: ["fixed"], focus: "fix" },
  },
};

export function IntakeChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="intake" spec={INTAKE} previous={previous} />;
}
