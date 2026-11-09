import { gridBeat as beat } from "../design/beat";
import { HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "./open-timeline";
import { CUTDOWN, HERO, type Plan, type ShotId, shotOf } from "./timelines";

export interface StillPlan {
  /** every keyframe rendered for the eye */
  frames: number[];
  /** frames where tagged text must be on screen and pass the size and opacity floor */
  hero: number[];
}

const at = (...beats: number[]): number[] => beats.map((n) => beat(n));

/** Three frames per shot (first, middle, last) so every cut and every hold is seen once. */
const ofPlan = (film: Plan<string>): StillPlan => ({
  frames: film.shots.flatMap((shot) => [shot.start + 1, shot.start + Math.floor(shot.frames / 2), shot.start + shot.frames - 1]),
  hero: [],
});

const atBeats = (id: ShotId, ...beats: number[]): number[] => beats.map((n) => shotOf(id).beat(n));

const shotStills = (id: ShotId, frames?: number[], hero: number[] = []): StillPlan => {
  const length = HERO.shots.find((shot) => shot.id === id)?.frames ?? 1;
  return { frames: frames ?? [6, Math.floor(length / 3), Math.floor((2 * length) / 3), length - 2], hero };
};

export const STILLS: Record<string, StillPlan> = {
  "shot-cold-open": shotStills("cold-open", [4, 20, 40, 60, 100, 143], [100, 143]),
  "shot-find-line": shotStills("find-line", [10, 30, 60, 100, 150, 190, 212, 236, 262], [190, 212]),
  "shot-play-line": shotStills("play-line", [3, 8, 14, 28, 44, 70, 100, 150, 200, 266], [30, 200, 266]),
  "shot-lyrics": shotStills("lyrics"),
  "shot-queue": shotStills("queue"),
  "shot-mixes": shotStills("mixes"),
  "shot-mood": shotStills("mood"),
  "shot-session": shotStills("session"),
  "shot-shells": shotStills("shells"),
  "shot-notch": shotStills("notch"),
  "shot-keys": shotStills(
    "keys",
    atBeats("keys", 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5),
    atBeats("keys", 1.5, 3.5, 5.5, 7.5, 9.5, 11.5),
  ),
  "shot-yours": shotStills(
    "yours",
    atBeats("yours", 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5),
    atBeats("yours", 1.5, 3.5, 5.5, 7.5, 9.5, 11.5),
  ),
  "shot-land": shotStills("land", atBeats("land", 0.5, 1.5, 2.5, 4.5, 5.2, 6, 7, 8.6, 9.8, 11.9), atBeats("land", 4.5, 11.9)),
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
  hero: ofPlan(HERO),
  "cutdown-vertical": ofPlan(CUTDOWN),
  "loop-readme": { frames: at(0.5, 2, 4, 8, 12, 16, 19.5), hero: [] },
};
