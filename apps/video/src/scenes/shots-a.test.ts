import { expect, test } from "bun:test";
import { DOWN_AT, ENTER_AT, LANDINGS, RESULTS_AT, WHIP_AT } from "./s2-palette";
import { S1_CUES } from "./shot-cold-open";
import { S2_CUES } from "./shot-find-line";
import { S3_CUES } from "./shot-play-line";
import { THEMES_CUES } from "./shot-themes";
import { shotOf } from "./timelines";

const sorted = (frames: readonly number[]): boolean => frames.every((at, i) => i === 0 || at >= (frames[i - 1] ?? 0));

test("every cue of S1 to S3 lands inside its shot, in order", () => {
  const shots = [
    { id: "cold-open", cues: S1_CUES },
    { id: "find-line", cues: S2_CUES },
    { id: "play-line", cues: S3_CUES },
    { id: "themes", cues: THEMES_CUES },
  ] as const;
  for (const { id, cues } of shots) {
    const frames = shotOf(id).frames;
    const times = cues.map((cue) => cue.at);
    expect(times.every((at) => at >= 0 && at < frames)).toBe(true);
    expect(cues.every((cue) => cue.shot === id)).toBe(true);
    expect(sorted(times)).toBe(true);
  }
});

test("the lyric is typed before the results land, and the keys come before the whip", () => {
  expect(LANDINGS.at(-1)).toBeLessThan(RESULTS_AT);
  expect(DOWN_AT).toBeLessThan(ENTER_AT);
  expect(ENTER_AT).toBeLessThan(WHIP_AT);
});
