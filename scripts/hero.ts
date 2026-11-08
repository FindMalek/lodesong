import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { captureHero, captureStrip, open, type Theme } from "./hero/capture";
import { composeHero, composeStrip } from "./hero/compose";
import { seed, signIn } from "./hero/seed";
import { APP, startStack } from "./hero/stack";

const THEMES: Theme[] = ["dark", "light"];
const raw = process.env.HERO_RAW ?? mkdtempSync(join(tmpdir(), "lodesong-hero-raw-"));

const build = Bun.spawnSync(["bun", "scripts/build.ts"], { stdout: "inherit", stderr: "inherit" });
if (build.exitCode !== 0) throw new Error("the build failed");

mkdirSync("docs", { recursive: true });
const browser = await chromium.launch();
const stop = await startStack();
try {
  const base = `http://127.0.0.1:${APP}`;
  const seeding = await (await open(browser, "dark", 1280, 800, 1)).newPage();
  await signIn(seeding, base);
  const found = await seed(seeding, base);
  await seeding.close();
  for (const theme of THEMES) {
    const frames = await captureHero(browser, theme, found, raw);
    await captureStrip(browser, theme, found, raw);
    await composeHero(browser, raw, "docs", theme, frames);
    await composeStrip(browser, raw, "docs", theme);
  }
} finally {
  stop();
  await browser.close();
}
