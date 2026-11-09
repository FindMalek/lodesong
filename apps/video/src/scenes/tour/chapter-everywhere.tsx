import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const EVERYWHERE: ChapterSpec = {
  hosts: {
    "session-one": { plates: ["phone-before", "handed-off"], focus: "bar" },
    "session-picker": { plates: ["picker"], focus: "iphone", cursor: true },
    "session-handoff": { plates: ["handed-off", "phone-after"], focus: "bar" },
    "mac-notch": { push: 1.03, bare: true },
    "mac-bars": { push: 1.03, bare: true },
    ios: { focus: [0.05, 0.45, 0.9, 0.5], push: 1.6 },
    android: { focus: [0.05, 0.1, 0.9, 0.45], push: 1.6 },
  },
};

export function EverywhereChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="everywhere" spec={EVERYWHERE} previous={previous} />;
}
