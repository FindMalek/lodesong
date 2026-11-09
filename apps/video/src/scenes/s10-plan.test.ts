import { expect, test } from "bun:test";
import { FILM } from "../copy";
import { cutFrames, S10_CUES, S10_CUTS } from "./s10-plan";
import { flashFrames, REST_FRAMES, S11_CUES, S11_FLASHES } from "./s11-plan";
import { S12_CUES, S12_TIMES, S12_TYPED } from "./s12-plan";
import { shotOf } from "./timelines";

test("the keyboard storm is eight cuts that tile the shot, every key landing inside its cut", () => {
  const shot = shotOf("keys");
  expect(S10_CUTS).toHaveLength(8);
  const spans = S10_CUTS.map(cutFrames);
  expect(spans[0]?.from).toBe(0);
  expect(spans.reduce((sum, span) => sum + span.frames, 0)).toBe(shot.frames);
  for (const span of spans) for (const strike of span.strikes) expect(strike).toBeLessThan(span.frames);
  expect(S10_CUES.filter((cue) => cue.kind === "key")).toHaveLength(S10_CUTS.reduce((sum, cut) => sum + cut.keys.length, 0));
});

test("the flashes tile the shot, 17 to 40 frames, and the shot ends on 8 silent frames", () => {
  const shot = shotOf("yours");
  expect(S11_FLASHES).toHaveLength(8);
  const lengths = S11_FLASHES.map((_, i) => flashFrames(i).frames);
  for (const frames of lengths) {
    expect(frames).toBeGreaterThanOrEqual(17);
    expect(frames).toBeLessThanOrEqual(40);
  }
  expect(lengths.reduce((sum, frames) => sum + frames, 0)).toBe(shot.frames);
  expect(S11_CUES.find((cue) => cue.kind === "rest")?.at).toBe(shot.frames - REST_FRAMES);
});

test("the land types the README command, enters on a beat and holds 8 frames of silence before the last hit", () => {
  const shot = shotOf("land");
  expect(S12_TYPED.map((row) => row.length)).toEqual(FILM.end.docker.map((line) => line.length));
  expect(S12_TYPED.flat().every((at, i, all) => at >= (all[i - 1] ?? 0))).toBe(true);
  expect(Math.max(...S12_TYPED.flat())).toBeLessThan(S12_TIMES.enter);
  expect(S12_TIMES.enter).toBe(shot.beat(3));
  expect(S12_TIMES.hit - S12_TIMES.rest).toBe(8);
  const hits = S12_CUES.filter((cue) => cue.kind === "impact");
  expect(hits.at(-1)?.at).toBe(S12_TIMES.hit);
  expect(S12_CUES.some((cue) => cue.at > S12_TIMES.rest && cue.at < S12_TIMES.hit)).toBe(false);
  expect(S12_TIMES.hit).toBeLessThan(shot.frames);
});
