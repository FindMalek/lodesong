import { type ChapterProps, TourChapter } from "./engine";
import type { ChapterSpec } from "./spec";

export const PLAYBACK: ChapterSpec = {
  hosts: {
    "play-crossfade": { plates: ["off", "six-seconds"], focus: "slider", cursor: true },
    "play-replaygain": { focus: [0.35, 0.42, 0.42, 0.1] },
    "play-quality": { focus: [0.35, 0.62, 0.42, 0.14] },
    "play-precache": { lane: "tl" },
    "play-info": { focus: [0.78, 0.05, 0.22, 0.75], lane: "tl" },
    "play-seek": { lane: "tl" },
  },
};

export function PlaybackChapter({ previous }: ChapterProps) {
  return <TourChapter chapter="playback" spec={PLAYBACK} previous={previous} />;
}
