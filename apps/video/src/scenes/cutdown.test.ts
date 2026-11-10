import { expect, test } from "bun:test";
import { FPS } from "../design/beat";
import { CUT_FIND_CUES } from "./cut-find";
import { CUT_FLASHES_CUES } from "./cut-flashes";
import { CUT_HOOK_CUES } from "./cut-hook";
import { CUT_LAND_CUES } from "./cut-land";
import { CUT_MIXES_CUES } from "./cut-mixes";
import { CUT_SESSION_CUES } from "./cut-session";
import { LOOP_FRAMES } from "./loop";
import { type CutId, cutOf } from "./timelines";

test("every cue of a cut lands inside that cut", () => {
  const cuts: { id: CutId; cues: typeof CUT_HOOK_CUES }[] = [
    { id: "hook", cues: CUT_HOOK_CUES },
    { id: "find", cues: CUT_FIND_CUES },
    { id: "mixes", cues: CUT_MIXES_CUES },
    { id: "session", cues: CUT_SESSION_CUES },
    { id: "shells", cues: CUT_FLASHES_CUES },
    { id: "land", cues: CUT_LAND_CUES },
  ];
  for (const { id, cues } of cuts) {
    const frames = cutOf(id).frames;
    expect(cues.every((cue) => cue.shot === id && cue.at >= 0 && cue.at < frames)).toBe(true);
  }
});

test("the readme loop is 10 s so it can run at 30 fps without a remainder", () => {
  expect(LOOP_FRAMES).toBe(10 * FPS);
});
