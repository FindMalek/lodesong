import { readFileSync } from "node:fs";
import type { Manifest } from "./types";

/**
 * A contact sheet of the plates of the named features (all when none is named), in capture order, for eyeballing a
 * run: `bun scripts/hero/film/sheet.ts <out.png> [feature...]`. Prints which tile is which.
 */
const [out, ...ids] = process.argv.slice(2);
const ROOT = "apps/video/public/film";
if (!out) throw new Error("usage: sheet.ts <out.png> [feature...]");

const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, "utf8")) as Manifest;
const takes = Object.values(manifest.features).filter(
  (take) => !ids.length || ids.some((id) => take.id === id || take.id.startsWith(`${id}-`)),
);
const files = takes.flatMap((take) => take.plates.map((plate) => `${ROOT}/${plate.file}`));
if (!files.length) throw new Error("no plates for that selection");
const COLUMNS = Math.min(4, files.length);
const TILE = { w: 480, h: 300 };
const inputs = files.flatMap((file) => ["-i", file]);
const scaled = files.map(
  (_, at) =>
    `[${at}:v]scale=${TILE.w}:${TILE.h}:force_original_aspect_ratio=decrease,pad=${TILE.w}:${TILE.h}:(ow-iw)/2:(oh-ih)/2:color=0x202020[s${at}]`,
);
const layout = files.map((_, at) => `${(at % COLUMNS) * TILE.w}_${Math.floor(at / COLUMNS) * TILE.h}`).join("|");
const filter =
  files.length === 1
    ? `${scaled[0]};[s0]null[out]`
    : `${scaled.join(";")};${files.map((_, at) => `[s${at}]`).join("")}xstack=inputs=${files.length}:layout=${layout}[out]`;
const run = Bun.spawnSync([
  "ffmpeg",
  "-y",
  "-loglevel",
  "error",
  ...inputs,
  "-filter_complex",
  filter,
  "-map",
  "[out]",
  "-frames:v",
  "1",
  out,
]);
if (run.exitCode !== 0) throw new Error(run.stderr.toString());
for (const [at, file] of files.entries()) console.log(`${at}: ${file.replace(`${ROOT}/`, "")}`);
