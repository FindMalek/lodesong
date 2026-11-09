import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const FORYOU: ChapterSpec = {
  hosts: {
    "mix-discover": { focus: "discover weekly" },
    "mix-daylist": { focus: "daylist" },
    "radio-station": { plates: ["preview"], focus: "header" },
    "radio-tune": { plates: ["preview", "playing"], focus: "header" },
    "home-jump": { focus: [0.18, 0.25, 0.8, 0.22] },
    "home-rows": { focus: [0.18, 0.47, 0.8, 0.5] },
  },
};

export function ForyouChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="foryou" spec={FORYOU} previous={previous} />;
}
