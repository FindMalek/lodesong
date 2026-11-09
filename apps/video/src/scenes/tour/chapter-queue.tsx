import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const QUEUE: ChapterSpec = {
  hosts: {
    "queue-visible": { focus: [0.76, 0.04, 0.24, 0.6], push: 1.6, lane: "tl" },
    "queue-reorder": { focus: [0.78, 0.18, 0.22, 0.55], push: 1.7, cursor: true, lane: "tl" },
    "queue-undo": { focus: [0.05, 0.45, 0.55, 0.4], push: 1.4 },
    "queue-shuffle": { push: 2.2 },
    "queue-stop-after": { push: 2 },
    "queue-sleep": { push: 1.8 },
    "queue-trims": { focus: [0.3, 0.85, 0.35, 0.12], push: 1.9 },
    "queue-never": { push: 1.7 },
    dnd: { plates: ["before", "dropped"], focus: "folder", cursor: true, push: 1.8 },
    "menu-context": { cursor: true },
    "multi-select": { push: 1.5 },
    like: { push: 2.2 },
  },
};

export function QueueChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="queue" spec={QUEUE} previous={previous} />;
}
