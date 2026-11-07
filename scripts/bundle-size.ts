import { gzipSync } from "node:zlib";
import tailwind from "bun-plugin-tailwind";

// Fails when the first screen's gzipped JS and CSS grow past the budget; lazy chunks aren't budgeted. Never loosen
// without saying why in the PR (#99 lazy tooltips 175 → 155, #119 nine features 155 → 160, #380 the inline logo mark 160 → 161).
const BUDGET_KB = { js: 161, css: 30 };
const LAZY_ONLY = ["recharts", "cmdk"];

const result = await Bun.build({
  entrypoints: ["apps/player/src/index.html"],
  minify: true,
  splitting: true,
  metafile: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success || !result.metafile) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const name = (path: string) => path.replace(/^\.\//, "").split("/").pop() ?? path;
const outputs = result.metafile.outputs;
const html = await result.outputs.find((output) => output.path.endsWith(".html"))?.text();
// The first screen loads what index.html references plus everything those chunks import statically.
const initial = new Set([...(html ?? "").matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((match) => name(match[1] as string)));
for (const chunk of [...initial]) {
  const queue = [chunk];
  while (queue.length) {
    const current = queue.pop() as string;
    const entry = Object.entries(outputs).find(([path]) => name(path) === current)?.[1];
    for (const item of entry?.imports ?? []) {
      if (item.kind !== "import-statement" || initial.has(name(item.path))) continue;
      initial.add(name(item.path));
      queue.push(name(item.path));
    }
  }
}

const totals = { js: 0, css: 0, lazy: 0 };
for (const output of result.outputs) {
  const kind = output.path.endsWith(".css") ? "css" : output.path.endsWith(".js") ? "js" : null;
  if (!kind) continue;
  const size = gzipSync(new Uint8Array(await output.arrayBuffer())).length / 1024;
  if (initial.has(name(output.path))) totals[kind] += size;
  else totals.lazy += size;
}

const early = LAZY_ONLY.filter((library) =>
  [...initial].some((chunk) =>
    Object.entries(outputs).some(
      ([path, entry]) => name(path) === chunk && Object.keys(entry.inputs).some((input) => input.includes(`node_modules/${library}/`)),
    ),
  ),
);

let failed = early.length > 0;
for (const library of early) console.log(`${library} is in the first-screen JS: import it lazily  OVER BUDGET`);
for (const kind of ["js", "css"] as const) {
  const over = totals[kind] > BUDGET_KB[kind];
  failed ||= over;
  console.log(`first screen ${kind}: ${totals[kind].toFixed(1)} KB gzip (budget ${BUDGET_KB[kind]} KB)${over ? "  OVER BUDGET" : ""}`);
}
console.log(`lazy chunks: ${totals.lazy.toFixed(1)} KB gzip`);

const report = {
  js: Number(totals.js.toFixed(1)),
  css: Number(totals.css.toFixed(1)),
  lazy: Number(totals.lazy.toFixed(1)),
  budget: BUDGET_KB,
};
if (process.env.SIZE_REPORT) await Bun.write(process.env.SIZE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
  await Bun.write(
    process.env.GITHUB_STEP_SUMMARY,
    `${await Bun.file(process.env.GITHUB_STEP_SUMMARY).text()}### first-screen size (gzip)\n\n| | now | budget |\n|---|---|---|\n| js | ${report.js} KB | ${BUDGET_KB.js} KB |\n| css | ${report.css} KB | ${BUDGET_KB.css} KB |\n| lazy chunks | ${report.lazy} KB | |\n`,
  );
process.exit(failed ? 1 : 0);
