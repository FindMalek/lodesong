import { expect, test } from "bun:test";
import { LINE_SAY, SING_RATE, wordSpans } from "../ui/s4-lyric-data";
import { S4_CUES } from "./shot-lyrics";
import { S6_CUES } from "./shot-mixes";
import { S5_CUES } from "./shot-queue";
import { shotOf } from "./timelines";

const SETS = [
  { id: "lyrics", cues: S4_CUES },
  { id: "queue", cues: S5_CUES },
  { id: "mixes", cues: S6_CUES },
] as const;

test("every cue of S4 to S6 lands inside its shot and in order", () => {
  for (const { id, cues } of SETS) {
    const frames = cues.map((cue) => cue.at);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frames)).toBeLessThan(shotOf(id).frames);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
  }
});

test("the karaoke fill takes each word of the manifest line in turn, on the manifest timings", () => {
  const spans = wordSpans(LINE_SAY, 100);
  expect(spans).toHaveLength(6);
  spans.forEach((span, i) => {
    expect(span.to).toBeGreaterThan(span.from);
    if (i > 0) expect(span.from).toBe(spans[i - 1]?.to ?? -1);
  });
  expect(spans[0]?.from).toBe(100);
  expect((spans[2]?.from ?? 0) - 100).toBe(Math.round((1410 / 1000) * (60 / SING_RATE)));
});

test("the queue gives way row by row as the dragged row climbs: four rising ticks", () => {
  const ticks = S5_CUES.filter((cue) => cue.kind === "tick" && cue.label.startsWith("row"));
  expect(ticks).toHaveLength(4);
});
