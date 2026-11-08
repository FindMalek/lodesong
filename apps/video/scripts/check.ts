import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import type { Film } from "../src/audio-cues";
import { type Box, type Measure, PROBE_TAG } from "../src/design/probe";
import { HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "../src/scenes/open-timeline";
import { audio, onsets } from "./audio-check";

// bun scripts/check.ts stills [frames...] [--docs] | audio [hero|cutdown] | onsets <file> [hero|cutdown]
// stills renders keyframes and fails on the legibility rules; audio and onsets check a wav or mp4 against the cue table
const FLOOR_PX = 28;
const MIN_OPACITY = 0.6;
const SAFE = 56;
const FRAME = { w: 1920, h: 1080 };
const ID = "scene-open";

const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box): boolean => a.x >= SAFE && a.y >= SAFE && a.x + a.w <= FRAME.w - SAFE && a.y + a.h <= FRAME.h - SAFE;

function judge(m: Measure): string[] {
  const problems: string[] = [];
  if (HERO_FRAMES.includes(m.frame) && m.legible.length === 0) problems.push("hero frame has no legible UI text");
  for (const item of m.legible) {
    if (item.px < FLOOR_PX) problems.push(`"${item.text}" is ${item.px.toFixed(1)} px, floor ${FLOOR_PX}`);
    if (item.opacity < MIN_OPACITY)
      problems.push(`"${item.text}" is at ${(item.opacity * 100).toFixed(0)}% opacity, floor ${MIN_OPACITY * 100}`);
  }
  if (SETTLED_FRAMES.includes(m.frame)) {
    if (m.panels.length === 0) problems.push("settled frame has no panels");
    for (const panel of m.panels) {
      if (!inside(panel)) problems.push(`panel ${JSON.stringify(panel)} leaves the ${SAFE} px safe area`);
      for (const furniture of m.furniture) if (hits(panel, furniture)) problems.push("a panel crosses the timecode");
    }
  }
  return problems;
}

async function stills(args: string[]): Promise<number> {
  const docs = args.includes("--docs");
  const picked = args.filter((arg) => !arg.startsWith("--")).map(Number);
  const frames = picked.length > 0 ? picked : [...new Set([...KEYFRAMES, ...HERO_FRAMES, ...SETTLED_FRAMES])].sort((a, b) => a - b);
  const started = performance.now();
  const serveUrl = await bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
  console.log(`bundle ${((performance.now() - started) / 1000).toFixed(1)} s`);
  const measures = new Map<number, Measure>();
  const inputProps = { probe: true };
  const composition = await selectComposition({ serveUrl, id: ID, inputProps });
  mkdirSync(docs ? "docs-stills" : "out/stills", { recursive: true });
  for (const frame of frames) {
    const output = docs ? `docs-stills/open-f${frame}.jpg` : `out/stills/f${frame}.png`;
    await renderStill({
      composition,
      serveUrl,
      output,
      frame,
      inputProps,
      ...(docs ? { imageFormat: "jpeg" as const, jpegQuality: 88 } : { imageFormat: "png" as const }),
      overwrite: true,
      onBrowserLog: (log) => {
        if (log.text.startsWith(PROBE_TAG)) measures.set(frame, JSON.parse(log.text.slice(PROBE_TAG.length)));
      },
    });
  }
  let failures = 0;
  for (const frame of frames) {
    const m = measures.get(frame);
    if (!m) {
      console.error(`f${frame}: probe returned nothing`);
      failures += 1;
      continue;
    }
    const problems = judge(m);
    const smallest = m.legible.reduce((min, item) => Math.min(min, item.px), Number.POSITIVE_INFINITY);
    console.log(
      `f${frame}: ${problems.length === 0 ? "ok" : "FAIL"}${m.legible.length ? ` smallest hero text ${smallest.toFixed(1)} px` : ""}`,
    );
    for (const problem of problems) console.error(`  ${problem}`);
    failures += problems.length;
  }
  console.log(`${frames.length} stills in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return failures;
}

const [command, ...rest] = process.argv.slice(2);
const filmOf = (name: string | undefined, file?: string): Film =>
  name === "cutdown" || (!name && file?.includes("cutdown")) ? "cutdown" : "hero";
let failed = 1;
if (command === "stills") failed = await stills(rest);
else if (command === "audio") failed = await audio(rest[0] ? [filmOf(rest[0])] : ["hero", "cutdown"]);
else if (command === "onsets" && rest[0]) failed = await onsets(rest[0], filmOf(rest[1], rest[0]));
else console.error("usage: check.ts stills [frames...] [--docs] | audio [hero|cutdown] | onsets <file> [hero|cutdown]");
process.exit(failed === 0 ? 0 : 1);
