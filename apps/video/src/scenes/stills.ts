import { gridBeat as beat } from "../design/beat";
import { HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "./open-timeline";
import { type CutId, cutOf, HERO, type Plan, type ShotId, shotOf } from "./timelines";

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

const cutAt = (id: CutId, ...local: number[]): number[] => local.map((frame) => cutOf(id).start + frame);

const CUT_FRAMES: Record<CutId, readonly number[]> = {
  hook: [0, 10, 24, 48, 90, 130],
  find: [4, 30, 52, 70, 90, 118, 132, 150, 190, 250],
  mixes: [4, 20, 40, 52, 66, 84, 118],
  session: [4, 20, 38, 56, 70, 112],
  shells: [6, 20, 36, 50, 66, 90, 104],
  land: [4, 20, 40, 56, 74, 110, 162],
};

const CUT_HERO: Record<CutId, readonly number[]> = {
  hook: [90, 130],
  find: [70, 90, 118, 190, 250],
  mixes: [66, 84, 118],
  session: [20, 38, 70, 112],
  shells: [20, 66, 104],
  land: [110, 162],
};

const cutStills = (): StillPlan => ({
  frames: Object.entries(CUT_FRAMES).flatMap(([id, local]) => cutAt(id as CutId, ...local)),
  hero: Object.entries(CUT_HERO).flatMap(([id, local]) => cutAt(id as CutId, ...local)),
});

const atBeats = (id: ShotId, ...beats: number[]): number[] => beats.map((n) => shotOf(id).beat(n));

const shotStills = (id: ShotId, frames?: number[], hero: number[] = []): StillPlan => {
  const length = HERO.shots.find((shot) => shot.id === id)?.frames ?? 1;
  return { frames: frames ?? [6, Math.floor(length / 3), Math.floor((2 * length) / 3), length - 2], hero };
};

export const STILLS: Record<string, StillPlan> = {
  "shot-cold-open": shotStills("cold-open", [3, 12, 26, 34, 50, 80, 110, 140, 170, 205, 245, 286], [245, 286]),
  "shot-find-line": shotStills("find-line", [10, 30, 60, 100, 150, 190, 212, 236, 262], [190, 212]),
  "shot-play-line": shotStills("play-line", [3, 8, 14, 28, 44, 70, 100, 150, 200, 266], [30, 200, 266]),
  "shot-lyrics": shotStills("lyrics"),
  "shot-lyterion": shotStills("lyterion"),
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
  "shot-themes": shotStills("themes", [4, 18, 28, 40, 70, 100, 125, 155, 185, 205], [70, 125, 185]),
  "shot-yours": shotStills("yours", atBeats("yours", 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5), atBeats("yours", 1.5, 3.5, 5.5, 7.5)),
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
  "cutdown-vertical": cutStills(),
  "loop-readme": { frames: [0, 40, 100, 150, 200, 240, 280, 340, 420, 470, 500, 560, 599], hero: [100, 240, 340] },
};
