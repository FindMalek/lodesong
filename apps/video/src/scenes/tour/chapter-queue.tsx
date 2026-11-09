import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const QUEUE: ChapterSpec = {
  hosts: {
    "queue-visible": { focus: [0.66, 0.04, 0.34, 0.72], push: 1.5 },
    "queue-reorder": { focus: [0.7, 0.1, 0.3, 0.7], cursor: true },
    dnd: { plates: ["before", "dropped"], focus: "folder", cursor: true },
    "menu-context": { cursor: true },
  },
};

export function QueueChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="queue" spec={QUEUE} previous={previous} />;
}
