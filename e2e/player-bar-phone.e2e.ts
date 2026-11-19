import type { Locator, Page } from "@playwright/test";
import { expect, fakeMediaClock, test } from "./fixtures";

test.use({ hasTouch: true, isMobile: true });

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (!found) throw new Error("not on screen");
  return found;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function playSomething(page: Page): Promise<void> {
  await page.addInitScript(fakeMediaClock);
  await page.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
}

for (const width of [390, 360]) {
  test(`the phone player bar keeps the cover, seek bar and times apart at ${width}px`, async ({ signedIn: page }) => {
    await page.setViewportSize({ width, height: 800 });
    if (process.env.SCHEME) await page.emulateMedia({ colorScheme: process.env.SCHEME as "light" | "dark" });
    await playSomething(page);
    const bar = page.getByRole("contentinfo");
    const times = bar.locator("[data-slot=audio-player-time]");
    await expect(times).toHaveCount(2);
    const cover = await box(bar.locator("img").first());
    const seek = await box(bar.locator("[data-slot=audio-player-seek]"));
    const elapsed = await box(times.nth(0));
    const duration = await box(times.nth(1));
    const parts = { cover, seek, elapsed, duration };
    for (const [a, b] of [
      ["cover", "seek"],
      ["cover", "elapsed"],
      ["cover", "duration"],
      ["seek", "elapsed"],
      ["seek", "duration"],
    ] as const)
      expect(overlaps(parts[a], parts[b]), `${a} overlaps ${b}: ${JSON.stringify([parts[a], parts[b]])}`).toBe(false);
    // The seek bar sits on its own row below the cover, with a time at each end.
    expect(seek.y).toBeGreaterThanOrEqual(cover.y + cover.height + 4);
    expect(seek.x - (elapsed.x + elapsed.width)).toBeGreaterThanOrEqual(8);
    expect(duration.x - (seek.x + seek.width)).toBeGreaterThanOrEqual(8);

    if (process.env.SHOTS)
      await page.screenshot({
        path: `${process.env.SHOTS}-${width}.png`,
        clip: { x: 0, y: 800 - (await box(bar)).height - 20, width, height: (await box(bar)).height + 20 },
      });
    for (const name of ["pause", "next", "queue", "more controls"]) {
      const control = await box(bar.getByRole("button", { name, exact: true }));
      expect(Math.min(control.width, control.height), name).toBeGreaterThanOrEqual(43.5);
    }
    expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth), "the bar scrolls sideways").toBe(true);
  });
}
