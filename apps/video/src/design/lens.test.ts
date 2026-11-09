import { expect, test } from "bun:test";
import { gridBeat as beat } from "./beat";
import { camAt, camTo, STAGE } from "./camera";
import { type CursorStop, clickFrames, cursorAt } from "./cursor";
import { defocus, focusAt } from "./dof";
import { connectPoint } from "./draw";
import { fillAt, wordsOf } from "./karaoke-fill";
import { camToBox, plateKeys, plateLayout } from "./plate";
import { whipProgress, whipSpeed } from "./whip";

const screenOf = (cam: { x: number; scale: number }, point: number, centre: number): number =>
  centre + cam.scale * (point - centre) - cam.x;

test("camTo puts the box centre on the middle of the frame", () => {
  const box = { x: 1200, y: 100, w: 300, h: 200 };
  const cam = camTo(box, { fill: 0.5 });
  expect(screenOf(cam, box.x + box.w / 2, STAGE.w / 2)).toBeCloseTo(STAGE.w / 2, 6);
  expect(cam.scale).toBeCloseTo(Math.min((STAGE.w * 0.5) / 300, (STAGE.h * 0.5) / 200), 6);
});

test("camToBox keeps the frame inside the plate when the target hugs an edge", () => {
  const layout = plateLayout();
  const cam = camToBox(layout, { x: 1300, y: 40, w: 140, h: 80 }, { scale: 2 });
  const rightEdge = layout.left + layout.size.w * layout.k;
  const visibleRight = STAGE.w / 2 + cam.x / cam.scale + STAGE.w / (2 * cam.scale);
  expect(visibleRight).toBeLessThanOrEqual(rightEdge);
});

test("plate keys arrive on their beat and hold", () => {
  const keys = plateKeys(plateLayout(), [
    { at: 0, box: { x: 0, y: 0, w: 1440, h: 900 }, scale: 1 },
    { at: 2, box: { x: 200, y: 300, w: 400, h: 100 }, scale: 1.5 },
  ]);
  expect(camAt(beat(2), keys).scale).toBe(1.5);
  expect(camAt(beat(5), keys).scale).toBe(1.5);
});

const STOPS: CursorStop[] = [
  { at: 0, x: 100, y: 100 },
  { at: 2, x: 600, y: 300, click: true },
  { at: 4, x: 200, y: 500, click: true },
];

test("the cursor is on each stop when its beat arrives and presses on the click frame", () => {
  for (const stop of STOPS) {
    const at = cursorAt(beat(stop.at), STOPS);
    expect(at.x).toBeCloseTo(stop.x, 4);
    expect(at.y).toBeCloseTo(stop.y, 4);
  }
  expect(clickFrames(STOPS)).toEqual([beat(2), beat(4)]);
  expect(cursorAt(beat(2), STOPS).press).toBe(1);
  expect(cursorAt(beat(3), STOPS).press).toBe(0);
});

test("the cursor path bows off the straight line instead of sliding", () => {
  const mid = cursorAt(beat(1.2), STOPS);
  const straight = (mid.x - 100) * 200 - (mid.y - 100) * 500;
  expect(Math.abs(straight)).toBeGreaterThan(1000);
});

test("a whip rests at both ends and its blur peaks in the middle", () => {
  expect(whipProgress(10, 10, 8)).toBe(0);
  expect(whipProgress(18, 10, 8)).toBe(1);
  const speeds = Array.from({ length: 8 }, (_, i) => whipSpeed(10 + i, 10, 8, 1920));
  expect(whipSpeed(5, 10, 8, 1920)).toBe(0);
  expect(Math.max(...speeds)).toBeGreaterThan(speeds[0] ?? 0);
  expect(whipSpeed(40, 10, 8, 1920)).toBe(0);
});

test("karaoke words tile the line and the fill only moves forward", () => {
  const words = wordsOf("say it slowly orbit", 1, 3);
  const last = words.at(-1);
  expect((last?.at ?? 0) + (last?.length ?? 0)).toBeCloseTo(4, 6);
  const word = words[2];
  if (!word) throw new Error("no word");
  const fills = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((n) => fillAt(beat(n), word));
  expect([...fills].sort((a, b) => a - b)).toEqual(fills);
  expect(fills[0]).toBe(0);
  expect(fills.at(-1)).toBe(1);
});

test("the connection pulse starts on one device and ends on the other", () => {
  const a = { x: 100, y: 300 };
  const b = { x: 900, y: 200 };
  expect(connectPoint(a, b, 0)).toEqual(a);
  expect(connectPoint(a, b, 1)).toEqual(b);
  expect(connectPoint(a, b, 0.5).x).toBeCloseTo(500, 6);
});

test("focus racks between keys and blur is zero on the focal plane", () => {
  const keys = [
    { at: 0, z: 300 },
    { at: 2, z: 0 },
  ];
  expect(focusAt(0, keys)).toBe(300);
  expect(focusAt(beat(1), keys)).toBeCloseTo(150, 6);
  expect(focusAt(beat(9), keys)).toBe(0);
  expect(defocus(120, 120)).toBe(0);
  expect(defocus(300, 0)).toBeGreaterThan(defocus(100, 0));
});
