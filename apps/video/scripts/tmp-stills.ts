import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";

// bun scripts/tmp-stills.ts <composition> <frame...>
const [id, ...rest] = process.argv.slice(2);
const frames = rest.map(Number);
const serveUrl = await bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
mkdirSync("/tmp/tourgen/out", { recursive: true });
const inputProps = { probe: false };
const composition = await selectComposition({ serveUrl, id: id ?? "tour", inputProps });
for (const frame of frames) {
  await renderStill({
    composition,
    serveUrl,
    output: `/tmp/tourgen/out/${id}-${String(frame).padStart(5, "0")}.png`,
    frame,
    inputProps,
    imageFormat: "jpeg",
    jpegQuality: 80,
    scale: 0.5,
    overwrite: true,
  });
}
console.log("done", frames.length);
