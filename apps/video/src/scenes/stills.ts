import { beat } from "../design/beat";
import { HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "./open-timeline";

export interface StillPlan {
  /** every keyframe rendered for the eye */
  frames: number[];
  /** frames where tagged text must be on screen and pass the size and opacity floor */
  hero: number[];
  /** frames where panels must sit inside the safe area and clear of the timecode */
  settled: number[];
}

const at = (...beats: number[]): number[] => beats.map((n) => beat(n));

export const STILLS: Record<string, StillPlan> = {
  "scene-open": { frames: [...new Set([...KEYFRAMES, ...HERO_FRAMES, ...SETTLED_FRAMES])].sort((a, b) => a - b), hero: HERO_FRAMES, settled: SETTLED_FRAMES },
  "scene-mixes": { frames: at(1, 2.5, 4, 5.5, 7, 8.5, 9.9), hero: at(8, 9.9), settled: [] },
  "scene-session": { frames: at(1, 2.5, 4, 5.5, 6.5, 8, 10.9), hero: at(4, 10.9), settled: [] },
  "scene-keys": { frames: at(0.5, 2, 3.5, 5, 6, 7.9), hero: at(3, 7.9), settled: [] },
  "scene-terminal": { frames: at(0.5, 2, 3.5, 5, 7.9), hero: at(2.5, 7.9), settled: [] },
  "scene-end": { frames: at(0.5, 1.5, 2.5, 4, 7.9), hero: at(4, 7.9), settled: [] },
  hero: { frames: at(8, 20, 28, 40, 48, 54, 59.9), hero: [], settled: [] },
  "cutdown-vertical": { frames: at(2, 6, 9, 12, 15, 19, 22, 26, 29.9), hero: [], settled: [] },
  "loop-readme": { frames: at(0.5, 4, 8, 12, 16, 19.9), hero: [], settled: [] },
};
