import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { beat, FPS } from "../src/design/beat";
import { type Box, type Measure, PROBE_TAG } from "../src/design/probe";
import { CUES, HERO_FRAMES, KEYFRAMES, SETTLED_FRAMES } from "../src/scenes/open-timeline";

// bun scripts/check.ts stills [frames...] [--docs]   bundle once, render stills, fail on the legibility and furniture rules
// bun scripts/check.ts onsets <file.mp4>             find audio onsets in a rendered file and compare them to the cue table
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

async function onsets(file: string): Promise<number> {
  const decode = Bun.spawn(["ffmpeg", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], {
    stdout: "pipe",
  });
  const samples = new Float32Array(await new Response(decode.stdout).arrayBuffer());
  const win = 240;
  const envelope = (diff: boolean): number[] => {
    const env: number[] = [];
    for (let i = 1; i + win < samples.length; i += win) {
      let sum = 0;
      for (let j = i; j < i + win; j += 1) sum += ((samples[j] ?? 0) - (diff ? (samples[j - 1] ?? 0) : 0)) ** 2;
      env.push(Math.sqrt(sum / win));
    }
    return env;
  };
  const find = (env: number[], floor: number): number[] => {
    const found: number[] = [];
    for (let i = 5; i < env.length; i += 1) {
      const before = env.slice(i - 5, i).reduce((a, b) => a + b, 0) / 5 + 1e-4;
      const last = found.at(-1);
      if ((env[i] ?? 0) > before * 4 && (env[i] ?? 0) > floor && (last === undefined || i - last > 40)) found.push(i);
    }
    return found;
  };
  const found = [...find(envelope(false), 0.05), ...find(envelope(true), 0.01)];
  const frames = found.map((i) => (i * win * FPS) / 48_000);
  let failures = 0;
  for (const cue of CUES.filter((c) => c.detect)) {
    const want = beat(cue.at);
    const nearest = frames.reduce((best, f) => (Math.abs(f - want) < Math.abs(best - want) ? f : best), Number.POSITIVE_INFINITY);
    const delta = nearest - want;
    const ok = Math.abs(delta) <= 2;
    if (!ok) failures += 1;
    console.log(
      `${cue.voice} @ beat ${cue.at} (frame ${want}): onset ${nearest.toFixed(1)}, ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} frames ${ok ? "ok" : "FAIL"}`,
    );
  }
  return failures;
}

const [command, ...rest] = process.argv.slice(2);
let failed = 1;
if (command === "stills") failed = await stills(rest);
else if (command === "onsets" && rest[0]) failed = await onsets(rest[0]);
else console.error("usage: check.ts stills [frames...] [--docs] | onsets <file.mp4>");
process.exit(failed === 0 ? 0 : 1);
