import { describe, expect, test } from "bun:test";
import type { ShotCue } from "../captures/types";
import { S7_CUES } from "./shot-mood";
import { S8_CUES } from "./shot-session";
import { S9_CUES } from "./shot-shells";
import { shotOf } from "./timelines";

const SHOTS = [
  { cues: S7_CUES, id: "mood" },
  { cues: S8_CUES, id: "session" },
  { cues: S9_CUES, id: "shells" },
] as const;

describe("S7 to S9 cue lists", () => {
  for (const { cues, id } of SHOTS) {
    test(`${id}: every cue lands inside its shot`, () => {
      const { frames } = shotOf(id);
      expect(cues.length).toBeGreaterThan(0);
      for (const cue of cues as readonly ShotCue[]) {
        expect(cue.shot).toBe(id);
        expect(cue.at).toBeGreaterThanOrEqual(0);
        expect(cue.at).toBeLessThan(frames);
      }
    });
  }
});
