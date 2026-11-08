import { expect, test } from "bun:test";
import { hat, render } from "../../../scripts/audio/voices";
import { SHEET } from "./audio-cues";

const MAX_TAIL = 1e-3;

function tailRatio(left: Float32Array, right: Float32Array): number {
  const peak = Math.max(...left.map(Math.abs), ...right.map(Math.abs));
  return Math.max(Math.abs(left.at(-1) ?? 0), Math.abs(right.at(-1) ?? 0)) / peak;
}

test("every voice ends at least 60 dB under its own peak, so nothing ends in a click", () => {
  const seen = new Set<string>();
  const loud: string[] = [];
  for (const [index, cue] of SHEET.entries()) {
    const key = `${cue.kind}:${cue.style ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { audio } = render(cue, index);
    if (tailRatio(audio.l, audio.r) > MAX_TAIL) loud.push(key);
  }
  for (const open of [false, true]) {
    const { audio } = hat(1, open, 0, 3);
    if (tailRatio(audio.l, audio.r) > MAX_TAIL) loud.push(`hat open ${open}`);
  }
  expect(loud).toEqual([]);
});

test("the kick no longer rings for the whole beat", () => {
  const cue = SHEET.find((c) => c.kind === "kick");
  if (!cue) throw new Error("no kick in the sheet");
  const { audio } = render(cue, 0);
  const at = (seconds: number): number => Math.abs(audio.l[Math.round(seconds * 48000)] ?? 0);
  const early = Math.max(...Array.from({ length: 400 }, (_, i) => at(0.02 + i / 48000)));
  expect(at(0.5) / early).toBeLessThan(0.05);
});
