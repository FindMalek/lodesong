import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const FORYOU: ChapterSpec = {
  hosts: {
    "mix-discover": { focus: "discover weekly" },
    "mix-daylist": { focus: "daylist" },
    "radio-station": { plates: ["preview"], focus: "header" },
    "radio-tune": { plates: ["preview", "playing"], focus: "header" },
    "home-jump": { focus: [0.1, 0.28, 0.85, 0.3] },
    "home-rows": { focus: [0.1, 0.55, 0.85, 0.4] },
  },
};

export function ForyouChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="foryou" spec={FORYOU} previous={previous} />;
}
