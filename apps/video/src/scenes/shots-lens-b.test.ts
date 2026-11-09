import { expect, test } from "bun:test";
import { S4_CUES } from "./shot-lyrics";
import { LYTERION_CUES, LyterionShot } from "./shot-lyterion";
import { S6_CUES } from "./shot-mixes";
import { S5_CUES } from "./shot-queue";
import { shotOf } from "./timelines";

const BUDGET = {
  lyrics: shotOf("lyrics").frames,
  queue: shotOf("queue").frames,
  mixes: shotOf("mixes").frames,
  lyterion: shotOf("lyterion").frames,
} as const;

const SETS = [
  { id: "lyrics", cues: S4_CUES },
  { id: "queue", cues: S5_CUES },
  { id: "mixes", cues: S6_CUES },
  { id: "lyterion", cues: LYTERION_CUES },
] as const;

test("every cue of S4, S5, S6 and lyterion lands inside its beat budget and in order", () => {
  for (const { id, cues } of SETS) {
    const frames = cues.map((cue) => cue.at);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...frames)).toBeLessThan(BUDGET[id]);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
  }
});

test("lyterion is a shot component", () => {
  expect(typeof LyterionShot).toBe("function");
});

test("the queue gives way row by row as the dragged row climbs: four rising ticks", () => {
  const ticks = S5_CUES.filter((cue) => cue.kind === "tick" && cue.label.startsWith("row"));
  expect(ticks).toHaveLength(4);
});
