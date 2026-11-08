import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import type { Film } from "../src/audio-cues";
import { type Box, type Measure, PROBE_TAG } from "../src/design/probe";
import { STILLS, type StillPlan } from "../src/scenes/stills";
import { audio, onsets } from "./audio-check";

// bun scripts/check.ts stills <composition|all> [frames...] [--docs] | audio [hero|cutdown] | onsets <file> [hero|cutdown]
// stills renders keyframes and fails on the legibility rules; audio and onsets check a wav or mp4 against the cue table
const FLOOR_PX = 28;
const MIN_OPACITY = 0.6;
const SAFE = 56;
let frameSize = { w: 1920, h: 1080 };

const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box): boolean =>
  a.x >= SAFE && a.y >= SAFE && a.x + a.w <= frameSize.w - SAFE && a.y + a.h <= frameSize.h - SAFE;

function judge(m: Measure, plan: StillPlan): string[] {
  const problems: string[] = [];
  if (plan.hero.includes(m.frame) && m.legible.length === 0) problems.push("hero frame has no legible text");
  for (const item of m.legible) {
    if (item.px < FLOOR_PX) problems.push(`"${item.text}" is ${item.px.toFixed(1)} px, floor ${FLOOR_PX}`);
    if (item.opacity < MIN_OPACITY)
      problems.push(`"${item.text}" is at ${(item.opacity * 100).toFixed(0)}% opacity, floor ${MIN_OPACITY * 100}`);
  }
  if (plan.settled.includes(m.frame)) {
    if (m.panels.length === 0) problems.push("settled frame has no panels");
    for (const panel of m.panels) {
      if (!inside(panel)) problems.push(`panel ${JSON.stringify(panel)} leaves the ${SAFE} px safe area`);
      for (const furniture of m.furniture) if (hits(panel, furniture)) problems.push("a panel crosses the timecode");
    }
  }
  return problems;
}

async function stillsOf(serveUrl: string, id: string, picked: number[], docs: boolean): Promise<number> {
  const plan = STILLS[id];
  if (!plan) {
    console.error(`no still plan for ${id}`);
    return 1;
  }
  const frames = picked.length > 0 ? picked : plan.frames;
  const measures = new Map<number, Measure>();
  const inputProps = { probe: true };
  const composition = await selectComposition({ serveUrl, id, inputProps });
  frameSize = { w: composition.width, h: composition.height };
  for (const frame of frames) {
    await renderStill({
      composition,
      serveUrl,
      output: docs ? `docs-stills/${id}-f${frame}.jpg` : `out/stills/${id}-f${frame}.png`,
      frame,
      inputProps,
      ...(docs ? { imageFormat: "jpeg" as const, jpegQuality: 86 } : { imageFormat: "png" as const }),
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
      console.error(`${id} f${frame}: probe returned nothing`);
      failures += 1;
      continue;
    }
    const problems = judge(m, plan);
    const smallest = m.legible.reduce((min, item) => Math.min(min, item.px), Number.POSITIVE_INFINITY);
    console.log(
      `${id} f${frame}: ${problems.length === 0 ? "ok" : "FAIL"}${m.legible.length ? ` smallest tagged text ${smallest.toFixed(1)} px` : ""}`,
    );
    for (const problem of problems) console.error(`  ${problem}`);
    failures += problems.length;
  }
  return failures;
}

async function stills(args: string[]): Promise<number> {
  const docs = args.includes("--docs");
  const [id, ...rest] = args.filter((arg) => !arg.startsWith("--"));
  const picked = rest.map(Number);
  const started = performance.now();
  const serveUrl = await bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
  console.log(`bundle ${((performance.now() - started) / 1000).toFixed(1)} s`);
  mkdirSync(docs ? "docs-stills" : "out/stills", { recursive: true });
  const ids = id === "all" ? Object.keys(STILLS) : [id ?? "scene-open"];
  let failures = 0;
  for (const one of ids) failures += await stillsOf(serveUrl, one, picked, docs);
  console.log(`stills in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return failures;
}

const [command, ...rest] = process.argv.slice(2);
const filmOf = (name: string | undefined, file?: string): Film =>
  name === "cutdown" || (!name && file?.includes("cutdown")) ? "cutdown" : "hero";
let failed = 1;
if (command === "stills") failed = await stills(rest);
else if (command === "audio") failed = await audio(rest[0] ? [filmOf(rest[0])] : ["hero", "cutdown"]);
else if (command === "onsets" && rest[0]) failed = await onsets(rest[0], filmOf(rest[1], rest[0]));
else console.error("usage: check.ts stills <composition|all> [frames...] [--docs] | audio [hero|cutdown] | onsets <file> [hero|cutdown]");
process.exit(failed === 0 ? 0 : 1);
