import { beat } from "../design/beat";
import { HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "./open-timeline";

export interface StillPlan {
  /** every keyframe rendered for the eye */
  frames: number[];
  /** frames where tagged text must be on screen and pass the size and opacity floor */
  hero: number[];
}

const at = (...beats: number[]): number[] => beats.map((n) => beat(n));

export const STILLS: Record<string, StillPlan> = {
  "scene-open": {
    frames: [...new Set([...KEYFRAMES, ...HERO_FRAMES, ...SETTLED_FRAMES])].sort((a, b) => a - b),
    hero: HERO_FRAMES,
  },
  "scene-lens-demo": {
    frames: at(0.25, 1.75, 3.5, 5.5, 7.6, 8.5, 10.5, 11.2, 11.9),
    hero: [],
  },
  "scene-keys": { frames: at(0.5, 2, 3.5, 5, 7.5, 9.9), hero: at(3, 9.9) },
  "scene-mixes": { frames: at(1, 2.5, 3.5, 5.5, 7, 8.5, 9.9), hero: at(8, 9.9) },
  "scene-session": { frames: at(0.75, 2.5, 3.5, 5, 6, 7.5, 9.9), hero: at(5, 9.9) },
  "scene-terminal": { frames: at(0.5, 2, 3.5, 5, 7.9), hero: at(2.5, 7.9) },
  "scene-end": { frames: at(0.5, 1.5, 2.5, 3.5, 5.9), hero: at(4, 5.9) },
  hero: { frames: at(2, 4.5, 8, 10, 13, 17, 19, 21, 27, 30, 33, 37, 39.5, 42, 47, 50, 55, 59.9), hero: [] },
  "cutdown-vertical": { frames: at(2, 4.5, 6, 8, 10, 12, 15, 17.5, 19, 21, 24, 26, 27.5, 29.9), hero: [] },
  "loop-readme": { frames: at(0.5, 2, 4, 8, 12, 16, 19.5), hero: [] },
};
