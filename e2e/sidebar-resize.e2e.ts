import type { Page } from "@playwright/test";
import { expect, onPhone, test } from "./fixtures";

const handle = (page: Page) => page.getByRole("separator", { name: "resize sidebar" });
const centre = async (page: Page) => {
  const box = await handle(page).boundingBox();
  if (!box) throw new Error("no resize handle");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const width = async (page: Page) => (await page.locator("[data-slot=sidebar-container]").boundingBox())?.width ?? 0;

test("dragging the sidebar edge resizes it, and the width is still there after a reload", async ({ signedIn: page }) => {
  test.skip(onPhone(), "the phone has no sidebar to resize");
  expect(await width(page)).toBe(200);

  const { x, y } = await centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 4 });
  await page.mouse.up();
  expect(await width(page)).toBe(280);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");

  await page.reload();
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");
  expect(await width(page)).toBe(280);
});

test("the edge takes arrow keys, double click resets and dragging it away collapses the sidebar", async ({ signedIn: page }) => {
  test.skip(onPhone(), "the phone has no sidebar to resize");
  await handle(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "216");
  await page.keyboard.press("End");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "400");
  await page.keyboard.press("ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "400");
  await page.keyboard.press("Home");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "160");

  await handle(page).dblclick();
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "200");

  const { x, y } = await centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(40, y, { steps: 6 });
  await page.mouse.up();
  await expect(handle(page)).toHaveCount(0);
  expect(await width(page)).toBeLessThan(80);
});
