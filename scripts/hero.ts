import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { capture } from "./hero/capture";
import { compose } from "./hero/compose";
import { startStack } from "./hero/stack";

const raw = process.env.HERO_RAW ?? mkdtempSync(join(tmpdir(), "lodesong-hero-raw-"));

if (!process.env.HERO_RAW) {
  const stop = await startStack();
  try {
    await capture(raw, "dark", false);
    await capture(raw, "light", true);
  } finally {
    stop();
  }
}

const browser = await chromium.launch();
await compose(browser, raw, "docs");
await browser.close();
