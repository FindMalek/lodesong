import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// bun scripts/optimize-plates.ts
// Writes `<plate>.opt.jpg` (4:4:4, q92) next to every opaque capture PNG in public/film and lists them in
// public/film/optimised.json, which plateSrc() reads. Originals stay the source of truth, nothing here is committed
// (public/film ignores everything but the manifest). Skips files whose .opt is newer; run it again after a capture.

const ROOT = resolve(import.meta.dir, "../public/film");
const MAP = join(ROOT, "optimised.json");
const SUFFIX = ".opt.jpg";
const JOBS = 8;

function pngsIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pngsIn(path);
    return entry.name.endsWith(".png") ? [path] : [];
  });
}

function opaque(path: string): boolean {
  const probe = Bun.spawnSync(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", path]);
  const format = probe.stdout.toString().trim();
  return /^(rgb24|bgr24|rgb48be|gray|gray16be)$/.test(format);
}

async function encode(source: string, target: string): Promise<boolean> {
  const run = Bun.spawn(
    ["ffmpeg", "-v", "error", "-y", "-i", source, "-vf", "format=yuvj444p", "-q:v", "2", "-update", "1", target],
    { stderr: "pipe" },
  );
  const failed = (await run.exited) !== 0;
  if (failed) console.error(`${relative(ROOT, source)}: ${await new Response(run.stderr).text()}`);
  return !failed;
}

const sources = pngsIn(ROOT);
const map: Record<string, string> = {};
const queue: string[] = [];
for (const source of sources) {
  const target = source.replace(/\.png$/, SUFFIX);
  const key = relative(ROOT, source);
  if (!opaque(source)) continue;
  map[key] = relative(ROOT, target);
  if (!existsSync(target) || statSync(target).mtimeMs < statSync(source).mtimeMs) queue.push(source);
}

let done = 0;
let before = 0;
let after = 0;
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    for (let source = queue.pop(); source; source = queue.pop()) {
      const target = source.replace(/\.png$/, SUFFIX);
      if (await encode(source, target)) {
        done += 1;
        before += statSync(source).size;
        after += statSync(target).size;
      } else delete map[relative(ROOT, source)];
    }
  }),
);

for (const stale of readdirSync(ROOT, { recursive: true, encoding: "utf8" }))
  if (stale.endsWith(SUFFIX) && !existsSync(join(ROOT, stale.replace(SUFFIX, ".png")))) unlinkSync(join(ROOT, stale));

writeFileSync(MAP, `${JSON.stringify(map, null, 1)}\n`);
console.log(
  `film:optimize ${done} encoded, ${Object.keys(map).length - done} up to date${done ? `, ${(before / 1e6).toFixed(0)} MB png to ${(after / 1e6).toFixed(0)} MB jpg` : ""}`,
);
