import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { open } from "./capture";
import { prepare } from "./film/prepare";
import { RECIPES } from "./film/recipes";
import { FPS, lyricsOf, runRecipe, type Session, VIEWPORTS } from "./film/run";
import { filmSeed } from "./film/seed";
import { coverage } from "./film/served";
import { LONG_PORTS, MAIN_PORTS, startFilmStack } from "./film/stack";
import type { Manifest, Recipe } from "./film/types";
import { findSynced, signIn } from "./seed";

const OUT = "apps/video/public/film";
const MANIFEST = `${OUT}/manifest.json`;
const RECIPE_LIMIT_MS = 120_000;
const ATTEMPTS = 2;
const args = process.argv.slice(2);
const attach = args.includes("--attach");
const only = args
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7)
  .split(",");
const skipBuild = args.includes("--no-build") || attach;

if (args.includes("--list")) {
  for (const recipe of RECIPES)
    console.log(`${recipe.id}\t${recipe.shot ?? "tour"}\t${recipe.device ?? "desktop"}\t${recipe.stack ?? "main"}`);
  process.exit(0);
}

const chosen = (stack: "main" | "long"): Recipe[] =>
  RECIPES.filter(
    (recipe) => (recipe.stack ?? "main") === stack && (!only || only.some((id) => recipe.id === id || recipe.id.startsWith(`${id}-`))),
  );

function previous(): Manifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : null;
}

if (!skipBuild) {
  const build = Bun.spawnSync(["bun", "scripts/build.ts"], { stdout: "inherit", stderr: "inherit" });
  if (build.exitCode !== 0) throw new Error("the build failed");
}

mkdirSync(OUT, { recursive: true });
const failures: string[] = [];
const launch = () => chromium.launch({ args: ["--mute-audio"] });
let browser = await launch();
const manifest: Manifest = {
  version: 1,
  fps: FPS,
  viewports: VIEWPORTS,
  lyrics: previous()?.lyrics ?? null,
  features: only ? (previous()?.features ?? {}) : {},
  captures: {},
  uncapturable: {},
};

async function suite(ports: typeof MAIN_PORTS, tracks: number, recipes: Recipe[]): Promise<void> {
  if (!recipes.length) return;
  const stop = attach ? () => undefined : await startFilmStack(ports, tracks);
  try {
    const base = `http://127.0.0.1:${ports.app}`;
    const seeding = await (await open(browser, "dark", 1280, 800, 1)).newPage();
    await signIn(seeding, base);
    const found = attach ? await findSynced(seeding) : await filmSeed(seeding, base);
    if (!attach) await prepare(seeding);
    const { lyrics } = await lyricsOf(seeding, found);
    await seeding.close();
    if (ports === MAIN_PORTS) manifest.lyrics = lyrics;
    const starts = lyrics.lines.map((line) => line.start / 1000);
    const session: Session = { browser, base, found, starts, lyrics, out: OUT };
    for (const recipe of recipes) {
      console.log(`film: ${recipe.id}`);
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
          manifest.features[recipe.id] = await Promise.race([
            runRecipe(recipe, { ...session, browser }),
            Bun.sleep(RECIPE_LIMIT_MS).then(() => {
              throw new Error(`${recipe.id} took longer than ${RECIPE_LIMIT_MS / 1000} s`);
            }),
          ]);
          break;
        } catch (error) {
          const message = String(error instanceof Error ? error.message : error);
          console.error(`film: attempt ${attempt} FAILED ${message}`);
          // A hung or crashed Chromium takes every later recipe with it: start a clean one.
          await browser.close().catch(() => null);
          browser = await launch();
          if (attempt === ATTEMPTS) failures.push(message);
        }
      }
    }
  } finally {
    stop();
  }
}

try {
  await suite(MAIN_PORTS, 900, chosen("main"));
  await suite(LONG_PORTS, 10_000, chosen("long"));
  const sorted = Object.fromEntries(Object.entries(manifest.features).sort(([a], [b]) => a.localeCompare(b)));
  manifest.features = sorted;
  const report = coverage(manifest);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`film: ${Object.keys(sorted).length} recipes, manifest at ${MANIFEST}`);
  console.log(`film: coverage ${report.have}/${report.total} captures, ${report.features}/${report.featureTotal} features`);
  if (report.missing.length) console.log(`film: no plate yet for ${report.missing.join(", ")}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
