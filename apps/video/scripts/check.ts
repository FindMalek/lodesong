import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { FILMS, type Film } from "../src/audio-cues";
import { type Box, type Measure, PROBE_TAG } from "../src/design/probe";
import { STILLS, type StillPlan } from "../src/scenes/stills";
import { audio, onsets } from "./audio-check";

// bun scripts/check.ts stills <composition|all> [frames...] | sheet <composition> | audio [hero|tour|cutdown] | onsets <file> [hero|tour|cutdown]
// stills renders keyframes and fails on the rules for text tagged data-legible (size, opacity, safe area); other text is judged by eye
const FLOOR_PX = 28;
const MIN_OPACITY = 0.6;
const EDGE = 40;
const TALL_SAFE = { left: 60, right: 1020, top: 200, bottom: 1600 };

interface Size {
  w: number;
  h: number;
}

function outside(box: Box, size: Size): boolean {
  const tall = size.h > size.w;
  const area = tall ? TALL_SAFE : { left: EDGE, right: size.w - EDGE, top: EDGE, bottom: size.h - EDGE };
  return box.x < area.left || box.y < area.top || box.x + box.w > area.right || box.y + box.h > area.bottom;
}

function judge(m: Measure, plan: StillPlan, size: Size): string[] {
  const problems: string[] = [];
  if (plan.hero.includes(m.frame) && m.legible.length === 0) problems.push("hero frame has no legible text");
  for (const item of m.legible) {
    if (item.px < FLOOR_PX) problems.push(`"${item.text}" is ${item.px.toFixed(1)} px, floor ${FLOOR_PX}`);
    if (item.opacity < MIN_OPACITY)
      problems.push(`"${item.text}" is at ${(item.opacity * 100).toFixed(0)}% opacity, floor ${MIN_OPACITY * 100}`);
    if (item.opacity >= MIN_OPACITY && outside(item.box, size))
      problems.push(
        `"${item.text}" leaves the safe area (${Math.round(item.box.x)},${Math.round(item.box.y)} ${Math.round(item.box.w)}x${Math.round(item.box.h)})`,
      );
  }
  return problems;
}

async function stillsOf(serveUrl: string, id: string, picked: number[]): Promise<number> {
  const plan = STILLS[id];
  if (!plan) {
    console.error(`no still plan for ${id}`);
    return 1;
  }
  const frames = picked.length > 0 ? picked : plan.frames;
  const measures = new Map<number, Measure>();
  const inputProps = { probe: true };
  const composition = await selectComposition({ serveUrl, id, inputProps });
  const size = { w: composition.width, h: composition.height };
  for (const frame of frames) {
    await renderStill({
      composition,
      serveUrl,
      output: `out/stills/${id}-f${frame}.png`,
      frame,
      inputProps,
      imageFormat: "png",
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
    const problems = judge(m, plan, size);
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
  const [id, ...rest] = args;
  const picked = rest.map(Number);
  const started = performance.now();
  const serveUrl = await bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
  console.log(`bundle ${((performance.now() - started) / 1000).toFixed(1)} s`);
  mkdirSync("out/stills", { recursive: true });
  const ids = !id || id === "all" ? Object.keys(STILLS) : [id];
  let failures = 0;
  for (const one of ids) failures += await stillsOf(serveUrl, one, picked);
  console.log(`stills in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  return failures;
}

async function sheet(id: string): Promise<number> {
  const frameOf = (name: string): number => Number(name.slice(id.length + 2, -4));
  const files = readdirSync("out/stills")
    .filter((name) => name.startsWith(`${id}-f`) && name.endsWith(".png"))
    .sort((a, b) => frameOf(a) - frameOf(b));
  if (files.length === 0) return 1;
  const tall = id.includes("vertical");
  const cols = tall ? 7 : 4;
  const list = files.map((name) => `file '${resolve("out/stills", name)}'\nduration 1`).join("\n");
  writeFileSync("out/stills/sheet-list.txt", list);
  mkdirSync("out/sheets", { recursive: true });
  const filter = `scale=${tall ? 270 : 480}:-1,tile=${cols}x${Math.ceil(files.length / cols)}:padding=6:color=0x202020`;
  const run = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "out/stills/sheet-list.txt",
      "-vf",
      filter,
      "-frames:v",
      "1",
      `out/sheets/${id}.png`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  return (await run.exited) === 0 ? 0 : 1;
}

const [command, ...rest] = process.argv.slice(2);
const filmOf = (name: string | undefined, file?: string): Film =>
  FILMS.find((film) => film === name || (!name && file?.includes(film))) ?? "hero";
let failed = 1;
if (command === "stills") failed = await stills(rest);
else if (command === "sheet" && rest[0]) failed = await sheet(rest[0]);
else if (command === "audio") failed = await audio(rest[0] ? [filmOf(rest[0])] : [...FILMS]);
else if (command === "onsets" && rest[0]) failed = await onsets(rest[0], filmOf(rest[1], rest[0]));
else
  console.error(
    "usage: check.ts stills <composition|all> [frames...] | sheet <composition> | audio [hero|tour|cutdown] | onsets <file> [hero|tour|cutdown]",
  );
process.exit(failed === 0 ? 0 : 1);
