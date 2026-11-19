import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const MIN = 44;

async function hitSize(page: Page, target: Locator): Promise<{ w: number; h: number }> {
  return target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const hits = (x: number, y: number): boolean => {
      const found = document.elementFromPoint(x, y);
      return !!found && (el === found || el.contains(found) || found.contains(el));
    };
    let w = 0;
    let h = 0;
    while (w < 120 && hits(cx - w / 2 - 0.5, cy) && hits(cx + w / 2 + 0.5, cy)) w++;
    while (h < 120 && hits(cx, cy - h / 2 - 0.5) && hits(cx, cy + h / 2 + 0.5)) h++;
    return { w, h };
  });
}

for (const width of [390, 360]) {
  test.describe(`${width}px phone`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });

    test("every settings tab is on screen and sliders and switches have 44px targets", async ({ signedIn: page }) => {
      await page.goto("/settings/playback");
      const dialog = page.getByRole("dialog", { name: "settings" });
      const tabs = dialog.getByRole("tab");
      await expect(tabs).toHaveCount(9);
      for (const tab of await tabs.all()) {
        const box = (await tab.boundingBox()) as NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
        expect(box.x, `${await tab.textContent()} left edge`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${await tab.textContent()} right edge`).toBeLessThanOrEqual(width);
      }

      const thumb = dialog.getByRole("slider", { name: "crossfade seconds" });
      await thumb.scrollIntoViewIfNeeded();
      expect((await hitSize(page, thumb)).h).toBeGreaterThanOrEqual(MIN);
      expect((await thumb.boundingBox())?.width).toBeGreaterThanOrEqual(16);

      const toggle = dialog.getByRole("switch").first();
      await toggle.scrollIntoViewIfNeeded();
      const target = await hitSize(page, toggle);
      expect(target.h).toBeGreaterThanOrEqual(MIN);
      expect(target.w).toBeGreaterThanOrEqual(MIN);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });
}
