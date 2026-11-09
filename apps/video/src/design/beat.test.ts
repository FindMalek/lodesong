import { expect, test } from "bun:test";
import { beat, beatAtFrame, bpmAt, CUT_MAP, FPS, gridBeat, HERO_MAP, secondsOfBeat, TEMPO } from "./beat";

const ENDS = TEMPO.map((_, i) => TEMPO.slice(0, i + 1).reduce((sum, segment) => sum + segment.beats, 0));

test("the hero ramp is 76 beats, 2287 frames", () => {
  expect(HERO_MAP.totalBeats).toBe(76);
  expect(HERO_MAP.totalFrames).toBe(2287);
  expect(CUT_MAP.totalBeats).toBe(30);
});

test("beat is strictly increasing and integer, also between beats", () => {
  const frames = Array.from({ length: 76 * 4 + 1 }, (_, i) => beat(i / 4));
  expect(frames.every(Number.isInteger)).toBe(true);
  expect(frames.some((frame, i) => i > 0 && frame <= (frames[i - 1] ?? 0))).toBe(false);
});

test("every shot boundary lands within half a frame of its ideal second", () => {
  let seconds = 0;
  for (const [i, segment] of TEMPO.entries()) {
    seconds += (segment.beats * 60) / segment.bpm;
    expect(Math.abs(beat(ENDS[i] ?? 0) - seconds * FPS)).toBeLessThanOrEqual(0.5);
  }
});

test("bpm steps up at each boundary and seconds follow the local tempo", () => {
  expect(bpmAt(0)).toBe(100);
  expect(bpmAt(3.99)).toBe(100);
  expect(bpmAt(4)).toBe(104);
  expect(bpmAt(76)).toBe(138);
  expect(secondsOfBeat(4)).toBeCloseTo(2.4, 9);
  expect(secondsOfBeat(5)).toBeCloseTo(2.4 + 60 / 104, 9);
});

test("beatAtFrame inverts beat", () => {
  for (const count of [0, 1.5, 4, 9.25, 31, 60, 75.5]) expect(beatAtFrame(beat(count))).toBeCloseTo(count, 1);
});

test("gridBeat keeps the old 120 bpm grid", () => {
  expect(gridBeat(1)).toBe(30);
  expect(gridBeat(4, 100)).toBe(144);
});
