import { expect, test } from "bun:test";
import { FILM } from "../copy";
import { cutFrames, MOMENT_BEATS, S10_CUES, S10_CUTS } from "./s10-plan";
import { flashFrames, REST_FRAMES, S11_CUES, S11_FLASHES } from "./s11-plan";
import { S12_CUES, S12_TIMES, S12_TYPED } from "./s12-plan";
import { shotOf } from "./timelines";

const SECOND = 60;

test("the keyboard storm is two-beat moments that tile the shot, each held about a second with every key inside it", () => {
  const shot = shotOf("keys");
  expect(S10_CUTS).toHaveLength(shot.beats / MOMENT_BEATS);
  const spans = S10_CUTS.map(cutFrames);
  expect(spans[0]?.from).toBe(0);
  expect(spans.reduce((sum, span) => sum + span.frames, 0)).toBe(shot.frames);
  for (const span of spans) {
    expect(span.frames).toBeGreaterThanOrEqual(0.8 * SECOND);
    for (const strike of span.strikes) expect(strike).toBeLessThan(span.frames - 20);
  }
  expect(S10_CUES.filter((cue) => cue.kind === "key")).toHaveLength(S10_CUTS.reduce((sum, cut) => sum + cut.keys.length, 0));
});

test("yours is four equal flashes held about a second, with no jargon chips, and it ends on 8 silent frames", () => {
  const shot = shotOf("yours");
  expect(S11_FLASHES.map((flash) => flash.id)).toEqual(["offline", "share", "library", "server"]);
  expect(S11_FLASHES.reduce((sum, flash) => sum + flash.beats, 0)).toBe(shot.beats);
  const lengths = S11_FLASHES.map((_, i) => flashFrames(i).frames);
  for (const frames of lengths) expect(frames).toBeGreaterThanOrEqual(0.85 * SECOND);
  expect(lengths.reduce((sum, frames) => sum + frames, 0)).toBe(shot.frames);
  expect(S11_FLASHES.some((flash) => /10,000|:ro|never touches/.test(flash.chip))).toBe(false);
  expect(S11_CUES.find((cue) => cue.kind === "rest")?.at).toBe(shot.frames - REST_FRAMES);
});

test("the land types the README command from the first frame, enters on a beat and breathes 8 frames before the last hit", () => {
  const shot = shotOf("land");
  expect(S12_TYPED.map((row) => row.length)).toEqual(FILM.end.docker.map((line) => line.length));
  expect(S12_TYPED.flat().every((at, i, all) => at >= (all[i - 1] ?? 0))).toBe(true);
  expect(Math.min(...S12_TYPED.flat())).toBeGreaterThanOrEqual(S12_TIMES.typeFrom);
  expect(Math.max(...S12_TYPED.flat())).toBeLessThan(S12_TIMES.enter);
  expect(S12_TIMES.enter).toBe(shot.beat(3));
  expect(S12_TIMES.hit - S12_TIMES.rest).toBe(8);
  expect(S12_TIMES.hit).toBe(shot.beat(8));
  const hits = S12_CUES.filter((cue) => cue.kind === "impact");
  expect(hits.at(-1)?.at).toBe(S12_TIMES.hit);
  expect(S12_CUES.some((cue) => cue.at > S12_TIMES.rest && cue.at < S12_TIMES.hit)).toBe(false);
  expect(S12_TIMES.end - S12_TIMES.hit).toBeGreaterThan(0.8 * SECOND);
});
