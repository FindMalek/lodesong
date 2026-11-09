import { expect, test } from "bun:test";
import { gridBeat as beat, FPS } from "../design/beat";
import { CUES, FRAMES, holdSeconds, TEXT_ITEMS } from "./open-timeline";

const onHalfBeat = (at: number): boolean => Number.isInteger(at * 2);

test("every text item holds 0.5 s plus 0.3 s per word fully visible", () => {
  const short = TEXT_ITEMS.filter((item) => (beat(item.to) - beat(item.from)) / FPS < holdSeconds(item.words));
  expect(short.map((item) => item.id)).toEqual([]);
});

test("cues and text sit on the beat grid, UI hits on beat 2 or 4", () => {
  const offGrid = [...CUES.map((cue) => cue.at), ...TEXT_ITEMS.flatMap((item) => [item.from, item.to])].filter((at) => !onHalfBeat(at));
  const badUi = CUES.filter((cue) => cue.ui && !(Number.isInteger(cue.at) && cue.at % 2 === 1));
  const outside = CUES.filter((cue) => beat(cue.at) >= FRAMES);
  expect({ offGrid, badUi, outside }).toEqual({ offGrid: [], badUi: [], outside: [] });
});
