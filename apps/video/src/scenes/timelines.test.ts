import { expect, test } from "bun:test";
import { type CaptureEvent, eventFrame } from "../captures/types";
import { FPS, TEMPO, tempoMap } from "../design/beat";
import { CUT_IDS, CUTDOWN, chapterSpans, HERO, HERO_IDS, planFilm, shotFrame, shotOf } from "./timelines";

test("the hero is 15 shots, 4011 frames, tiled without gaps", () => {
  expect(HERO.shots.map((shot) => shot.id)).toEqual([...HERO_IDS]);
  expect(HERO.frames).toBe(4011);
  expect(HERO.shots.map((shot) => shot.frames)).toEqual([288, 277, 267, 257, 252, 249, 360, 348, 225, 222, 218, 317, 209, 209, 313]);
  for (const [i, shot] of HERO.shots.entries()) {
    expect(shot.start).toBe(HERO.shots[i - 1] ? (HERO.shots[i - 1]?.start ?? 0) + (HERO.shots[i - 1]?.frames ?? 0) : 0);
    expect(shot.bpm).toBe(TEMPO[i]?.bpm ?? 0);
  }
  expect(CUTDOWN.shots).toHaveLength(CUT_IDS.length);
});

test("the cutdown runs about 15 s on its own ramp", () => {
  expect(CUTDOWN.frames / FPS).toBeGreaterThan(14.9);
  expect(CUTDOWN.frames / FPS).toBeLessThan(15.0);
});

test("local beats follow the shot's own tempo and join the next shot", () => {
  const find = shotOf("find-line");
  expect(shotFrame("find-line", 0)).toBe(find.start);
  expect(find.beat(find.beats)).toBe(find.frames);
  expect(find.beat(1)).toBe(Math.round((60 / 104) * FPS));
});

test("chapters group consecutive shots", () => {
  const spans = chapterSpans(HERO);
  expect(spans.map((span) => span.id)).toEqual(["hook", "listen", "discover", "everywhere", "yours"]);
  expect(spans.reduce((sum, span) => sum + span.frames, 0)).toBe(HERO.frames);
});

test("a capture event lands on the shot-local frame its time and rate say", () => {
  const press: CaptureEvent = { t: 0.5, kind: "key" };
  expect(eventFrame({ capture: "cmdk-type", shot: "find-line", at: 20 }, press)).toBe(50);
  expect(eventFrame({ capture: "cmdk-type", shot: "find-line", at: 20, rate: 2 }, press)).toBe(35);
});

test("any shot list becomes a film, so the tour only needs its own table", () => {
  const table = [
    { beats: 2, bpm: 90 },
    { beats: 2, bpm: 90 },
    { beats: 4, bpm: 140 },
  ];
  const tour = planFilm(["a", "b", "c"], { a: "one", b: "two", c: "three" }, tempoMap(table), { a: "x", b: "x", c: "y" });
  expect(tour.frames).toBe(tour.shots.reduce((sum, shot) => sum + shot.frames, 0));
  expect(chapterSpans(tour).map((span) => [span.id, span.shots.length])).toEqual([
    ["x", 2],
    ["y", 1],
  ]);
});
