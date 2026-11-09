import { expect, test } from "bun:test";
import { RATE } from "../../../scripts/audio/dsp";
import { voice } from "../../../scripts/audio/synth";
import { SCORES } from "./audio-cues";

const MAX_TAIL = 1e-3;

function tailRatio(left: Float32Array, right: Float32Array): number {
  const peak = Math.max(...left.map(Math.abs), ...right.map(Math.abs));
  return Math.max(Math.abs(left.at(-1) ?? 0), Math.abs(right.at(-1) ?? 0)) / peak;
}

test("every voice ends at least 60 dB under its own peak, so nothing ends in a click", () => {
  const seen = new Set<string>();
  const loud: string[] = [];
  for (const [index, event] of SCORES.hero.events.entries()) {
    const key = `${event.track}:${event.style ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { l, r } = voice(event, index);
    if (tailRatio(l, r) > MAX_TAIL) loud.push(key);
  }
  expect(loud).toEqual([]);
});

test("the kick is tuned and short: it does not ring for the whole beat", () => {
  const event = SCORES.hero.events.find((e) => e.track === "kick");
  if (!event) throw new Error("no kick in the score");
  const { l } = voice(event, 0);
  const at = (seconds: number): number => Math.abs(l[Math.round(seconds * RATE)] ?? 0);
  const early = Math.max(...Array.from({ length: 400 }, (_, i) => at(0.02 + i / RATE)));
  expect(at(0.4) / early).toBeLessThan(0.05);
});
