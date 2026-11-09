import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { SPECS as SCORE_SPECS } from "../src/audio-cues";
import {
  CHAPTERS,
  CHIP_STEP,
  chapterRange,
  chipsOf,
  FEATURES,
  type Feature,
  hostsOf,
  MAX_CHIPS,
  MIN_FRAMES,
  TOUR_CUES,
  TOUR_MAP,
} from "../src/features";
import { MOCK_IDS } from "../src/scenes/tour/mocks";
import { mockIdOf, type PlateAsset, plateOf, platesOf } from "../src/scenes/tour/plates";
import { FEATURE_TAG, type FrameMeasure } from "../src/scenes/tour/probe";
import type { HostSpec } from "../src/scenes/tour/spec";
import { SPECS } from "../src/scenes/tour/specs";

// bun scripts/coverage.ts [--static] [--json]
// machine checks for the tour: the feature list, the frame table, the plates, the chips actually drawn, the cue sheet
const STATIC = process.argv.includes("--static");
const JSON_ONLY = process.argv.includes("--json");
const STAGE = { w: 1920, h: 1080 };
const SAFE = { x: 96, y: 54 };
const MIN_PX = 28;
const MIN_OPACITY = 0.95;
const PROBE_AT = 24;
const MIN_LUMA = 12;
const MIN_SPREAD = 5;
const SPARSE_SPREAD = 8;
const warnings: string[] = [];
const REPO = resolve(import.meta.dir, "../../..");

const failures: string[] = [];
const fail = (check: string, message: string): void => {
  failures.push(`${check}: ${message}`);
};

function lists(): void {
  const ids = new Set(FEATURES.map((feature) => feature.id));
  if (ids.size !== FEATURES.length) fail("list", `${FEATURES.length - ids.size} duplicate ids`);
  const numbers = FEATURES.map((feature) => feature.n);
  if (numbers.some((n, i) => n !== i + 1)) fail("list", "numbers are not 1..N in order");
  for (const chapter of CHAPTERS) if (hostsOf(chapter.id).length === 0) fail("list", `chapter ${chapter.id} has no host`);
  for (const feature of FEATURES) {
    if (feature.label.length > 32) fail("list", `${feature.id} label is ${feature.label.length} characters`);
    if (feature.label !== feature.label.toLowerCase() && !/[A-Z]/.test(feature.label.replace(/[A-Z]{1,3}\b/g, ""))) continue;
    if (feature.rideOn) {
      const host = FEATURES.find((one) => one.id === feature.rideOn);
      if (!host || host.chapter !== feature.chapter || host.wow === "C")
        fail("list", `${feature.id} rides on ${feature.rideOn}, not a host of ${feature.chapter}`);
    }
  }
}

function timing(): void {
  for (const feature of FEATURES) {
    const [from, to] = feature.tour;
    const [start, end] = chapterRange(feature.chapter);
    if (from < start || to > end) fail("timing", `${feature.id} ${from}-${to} leaves its chapter ${start}-${end}`);
    if (to - from < MIN_FRAMES) fail("timing", `${feature.id} lasts ${to - from} frames, floor ${MIN_FRAMES}`);
  }
  for (const chapter of CHAPTERS) {
    const hosts = hostsOf(chapter.id);
    hosts.forEach((host, i) => {
      const next = hosts[i + 1];
      if (next && host.tour[1] > next.tour[0]) fail("timing", `${host.id} overlaps ${next.id}`);
      const chips = chipsOf(host.id);
      if (chips.length > MAX_CHIPS[host.wow === "A" ? "A" : "B"]) fail("timing", `${host.id} carries ${chips.length} chips`);
      chips.forEach((chip, k) => {
        if (chip.tour[0] !== host.tour[0] + CHIP_STEP * (k + 1))
          fail("timing", `${chip.id} does not start ${CHIP_STEP * (k + 1)} frames after ${host.id}`);
      });
    });
  }
}

function cues(): void {
  const owned = new Map(SCORE_SPECS.tour.ui.map((event) => [event.label, event.frame]));
  for (const feature of FEATURES) {
    const cue = TOUR_CUES.find((one) => one.id === `feature:${feature.id}`);
    if (!cue || Math.abs(cue.frame - feature.tour[0]) > 1) fail("cues", `${feature.id} has no cue within 1 frame of ${feature.tour[0]}`);
    const heard = owned.get(`feature:${feature.id}`);
    if (heard === undefined || Math.abs(heard - feature.tour[0]) > 1)
      fail("cues", `${feature.id} has no sound in the score within 1 frame of ${feature.tour[0]}`);
  }
}

async function luma(path: string, region?: readonly [number, number, number, number]): Promise<{ mean: number; spread: number }> {
  const crop = region ? `crop=iw*${region[2]}:ih*${region[3]}:iw*${region[0]}:ih*${region[1]},` : "";
  const run = Bun.spawn(
    [
      "ffmpeg",
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `${crop}scale=480:270:flags=bilinear,format=gray`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ],
    {
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  const bytes = new Uint8Array(await new Response(run.stdout).arrayBuffer());
  const mean = bytes.reduce((sum, value) => sum + value, 0) / Math.max(1, bytes.length);
  const variance = bytes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, bytes.length);
  return { mean, spread: Math.sqrt(variance) };
}

const pathOf = (asset: PlateAsset): string =>
  asset.kind === "film" ? resolve(REPO, "apps/video/public/film", asset.file) : resolve(REPO, "docs", asset.file);

function headerSize(path: string): [number, number] | null {
  const head = readFileSync(path).subarray(0, 32);
  return head[0] === 0x89 ? [head.readUInt32BE(16), head.readUInt32BE(20)] : null;
}

function regionOf(asset: PlateAsset, focus: HostSpec["focus"]): readonly [number, number, number, number] | undefined {
  const box = typeof focus === "string" ? asset.boxes[focus] : undefined;
  const raw = Array.isArray(focus)
    ? (focus as readonly number[])
    : box
      ? [box.x / asset.w, box.y / asset.h, box.w / asset.w, box.h / asset.h]
      : undefined;
  if (!raw) return undefined;
  const [x = 0, y = 0, w = 1, h = 1] = raw;
  const [cx, cy] = [x + w / 2, y + h / 2];
  const [rw, rh] = [Math.min(1, Math.max(w * 1.4, 0.3)), Math.min(1, Math.max(h * 1.4, 0.3))];
  const [nx, ny] = [Math.min(1 - rw, Math.max(0, cx - rw / 2)), Math.min(1 - rh, Math.max(0, cy - rh / 2))];
  return [nx, ny, rw, rh];
}

async function plates(): Promise<{ mocks: string[]; checked: number }> {
  const mocks: string[] = [];
  let checked = 0;
  const seen = new Set<string>();
  for (const feature of FEATURES) {
    const host = feature.wow !== "C";
    const spec = host ? SPECS[feature.chapter].hosts[feature.id] : undefined;
    const mock = mockIdOf(feature.capture);
    if (spec?.scene) {
      mocks.push(`${feature.id}:scene`);
      continue;
    }
    if (mock) {
      if (host && !MOCK_IDS.includes(mock)) fail("plates", `${feature.id} wants mock ${mock}, no component`);
      if (host) mocks.push(`${feature.id}:${mock}`);
      continue;
    }
    const all = platesOf(feature.capture);
    const primary = plateOf(feature.capture);
    if (!primary) {
      fail("plates", `${feature.id} capture ${feature.capture} does not resolve`);
      continue;
    }
    const named = spec?.plates?.flatMap((name) => all.find((plate) => plate.name === name) ?? []) ?? [];
    for (const asset of named.length > 0 ? named : [primary]) {
      const path = pathOf(asset);
      const region = regionOf(asset, spec?.focus);
      const key = `${path}|${region?.join(",") ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!existsSync(path)) {
        fail("plates", `${feature.id} file missing: ${path}`);
        continue;
      }
      checked += 1;
      const size = headerSize(path);
      if (size) {
        const [w, h] = size;
        if (!Number.isInteger(w) || !Number.isInteger(h) || Math.abs(w / h - asset.w / asset.h) > 0.01)
          fail("plates", `${feature.id} is ${w}x${h}, expected ratio of ${asset.w}x${asset.h}`);
      }
      const { mean, spread } = await luma(path, region);
      if (mean < MIN_LUMA || spread < MIN_SPREAD)
        fail("plates", `${feature.id} looks blank (mean ${mean.toFixed(1)}, spread ${spread.toFixed(1)}): ${asset.file}`);
      else if (spread < SPARSE_SPREAD) warnings.push(`${feature.id} is a sparse screen (spread ${spread.toFixed(1)}): ${asset.file}`);
    }
  }
  return { mocks, checked };
}

const probeFrame = (feature: Feature): number => Math.min(feature.tour[0] + PROBE_AT, feature.tour[1] - 1);

function judge(feature: Feature, measure: FrameMeasure | undefined): void {
  if (!measure) {
    fail("dom", `${feature.id}: probe returned nothing at ${probeFrame(feature)}`);
    return;
  }
  const mine = measure.features.filter((one) => one.id === feature.id);
  const hit = mine[0];
  if (!hit) {
    fail("dom", `${feature.id}: no [data-feature] at frame ${measure.frame}`);
    return;
  }
  if (mine.length > 1) fail("dom", `${feature.id}: ${mine.length} elements at frame ${measure.frame}`);
  if (hit.opacity < MIN_OPACITY) fail("dom", `${feature.id}: opacity ${hit.opacity.toFixed(2)} at ${measure.frame}`);
  if (hit.px < MIN_PX) fail("dom", `${feature.id}: ${hit.px.toFixed(1)} px at ${measure.frame}`);
  const { x, y, w, h } = hit.box;
  if (x < SAFE.x || y < SAFE.y || x + w > STAGE.w - SAFE.x || y + h > STAGE.h - SAFE.y)
    fail("dom", `${feature.id}: outside the safe area (${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)})`);
}

function overlaps(measure: FrameMeasure): void {
  const chips = measure.features;
  for (const [i, a] of chips.entries()) {
    for (const b of chips.slice(i + 1)) {
      const apart =
        a.box.x + a.box.w <= b.box.x || b.box.x + b.box.w <= a.box.x || a.box.y + a.box.h <= b.box.y || b.box.y + b.box.h <= a.box.y;
      if (!apart) fail("dom", `${a.id} overlaps ${b.id} at frame ${measure.frame}`);
    }
  }
}

async function dom(): Promise<void> {
  const serveUrl = await bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
  const inputProps = { probe: true };
  const composition = await selectComposition({ serveUrl, id: "tour", inputProps });
  const browser = await openBrowser("chrome");
  const frames = [...new Set(FEATURES.map(probeFrame))].sort((a, b) => a - b);
  const measures = new Map<number, FrameMeasure>();
  const lane = async (mine: number[]): Promise<void> => {
    for (const frame of mine) {
      await renderStill({
        composition,
        serveUrl,
        output: null,
        frame,
        inputProps,
        puppeteerInstance: browser,
        imageFormat: "jpeg",
        scale: 0.1,
        overwrite: true,
        onBrowserLog: (log) => {
          if (!log.text.startsWith(FEATURE_TAG)) return;
          const measure = JSON.parse(log.text.slice(FEATURE_TAG.length)) as FrameMeasure;
          measures.set(measure.frame, measure);
        },
      }).catch((error: unknown) => fail("dom", `frame ${frame} did not render: ${String(error).slice(0, 120)}`));
    }
  };
  const LANES = 4;
  await Promise.all(Array.from({ length: LANES }, (_, k) => lane(frames.filter((_, i) => i % LANES === k))));
  await browser.close({ silent: true });
  for (const feature of FEATURES) judge(feature, measures.get(probeFrame(feature)));
  for (const measure of measures.values()) overlaps(measure);
}

function report(mocks: string[]): void {
  const rows = CHAPTERS.map((chapter) => {
    const mine = FEATURES.filter((feature) => feature.chapter === chapter.id);
    const frames = mine.map((feature) => feature.tour[1] - feature.tour[0]);
    return {
      chapter: chapter.id,
      features: mine.length,
      hosts: mine.filter((feature) => feature.wow !== "C").length,
      chips: mine.filter((feature) => feature.wow === "C").length,
      min: Math.min(...frames),
      avg: Math.round(frames.reduce((sum, value) => sum + value, 0) / frames.length),
      max: Math.max(...frames),
    };
  });
  const known = new Set(FEATURES.map((feature) => feature.id));
  const broken = new Set(failures.map((line) => line.split(": ")[1]?.split(/[ :]/)[0] ?? "").filter((id) => known.has(id)));
  const covered = FEATURES.length - broken.size;
  const out = { total: FEATURES.length, covered, frames: TOUR_MAP.totalFrames, chapters: rows, mocks, warnings, failures };
  if (JSON_ONLY) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  for (const row of rows)
    console.log(
      `${row.chapter.padEnd(11)} ${String(row.features).padStart(2)} features (${row.hosts} hosts, ${row.chips} chips)  frames min ${row.min} avg ${row.avg} max ${row.max}`,
    );
  console.log(`mock hosts: ${mocks.length}`);
  for (const line of warnings) console.log(`warn ${line}`);
  for (const line of failures) console.error(`FAIL ${line}`);
  console.log(
    `${Math.max(0, covered)} of ${FEATURES.length} features covered${STATIC ? " (static checks only)" : ""}, ${failures.length} problems`,
  );
  mkdirSync("out", { recursive: true });
  writeFileSync("out/coverage.json", JSON.stringify(out, null, 2));
}

lists();
timing();
cues();
const { mocks } = await plates();
if (!STATIC) await dom();
report(mocks);
process.exit(failures.length === 0 ? 0 : 1);
