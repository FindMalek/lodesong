import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const PLAYBACK: ChapterSpec = {
  hosts: {
    "play-crossfade": { plates: ["off", "six-seconds"], focus: "slider", cursor: true },
    "play-replaygain": { focus: [0.12, 0.42, 0.6, 0.22] },
    "play-quality": { focus: [0.12, 0.62, 0.6, 0.25] },
    "play-info": { focus: [0.65, 0.05, 0.35, 0.75] },
  },
};

export function PlaybackChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="playback" spec={PLAYBACK} previous={previous} />;
}
