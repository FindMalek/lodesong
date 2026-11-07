import type { Page } from "@playwright/test";
import { expect, onPhone, test } from "./fixtures";

const handle = (page: Page) => page.getByRole("separator", { name: "resize sidebar" });
const centre = async (page: Page) => {
  const box = await handle(page).boundingBox();
  if (!box) throw new Error("no resize handle");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const width = async (page: Page) => (await page.locator("[data-slot=sidebar-container]").boundingBox())?.width ?? 0;
const dragBy = async (page: Page, dx: number) => {
  const { x, y } = await centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
};

test.beforeEach(() => {
  test.skip(onPhone(), "the phone has no sidebar to resize");
});

test("dragging the sidebar edge resizes it, and the width is still there after a reload", async ({ signedIn: page }) => {
  expect(await width(page)).toBe(200);
  await dragBy(page, 80);
  expect(await width(page)).toBe(280);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");

  await page.reload();
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");
  expect(await width(page)).toBe(280);
});

test("the drag follows the pointer under the page zoom", async ({ signedIn: page }) => {
  await page.addStyleTag({ content: ":root { --zoom: 1.1; zoom: 1.1; }" });
  await expect(handle(page)).toBeVisible();
  await dragBy(page, 88);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");
});

test("the edge takes arrow keys and double click resets it", async ({ signedIn: page }) => {
  await handle(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "216");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("End");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "400");
  await page.keyboard.press("ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "400");
  await page.keyboard.press("Home");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "160");

  await handle(page).dblclick();
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "200");
});

test("releasing under 120px collapses the sidebar and it comes back at its old width", async ({ signedIn: page }) => {
  await dragBy(page, -81);
  await expect(handle(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+b");
  await expect(handle(page)).toBeVisible();
  expect(await width(page)).toBe(200);

  await dragBy(page, -79);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "160");
  expect(await width(page)).toBe(160);
});

test("a right click drag does not resize", async ({ signedIn: page }) => {
  const { x, y } = await centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 100, y, { steps: 4 });
  await page.mouse.up({ button: "right" });
  expect(await width(page)).toBe(200);
});

test("hiding the sidebar in the middle of a drag leaves no half width behind", async ({ signedIn: page }) => {
  const { x, y } = await centre(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y, { steps: 4 });
  await page.keyboard.press("ControlOrMeta+b");
  await page.mouse.up();
  await page.keyboard.press("ControlOrMeta+b");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "200");
  expect(await width(page)).toBe(200);
});

test("a touch the browser takes over goes back to the old width", async ({ signedIn: page, browserName }) => {
  test.skip(browserName !== "chromium", "needs CDP touch events");
  await expect(handle(page)).toHaveCSS("touch-action", "none");
  const { x, y } = await centre(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 90, y }] });
  await expect.poll(() => width(page)).toBe(290);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(() => width(page)).toBe(200);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "200");
});

test("a wide sidebar does not push a page off a small window", async ({ signedIn: page }) => {
  await page.evaluate(() => {
    const key = "keep-player:settings";
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? "{}"), sidebarWidth: 400 }));
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/playlist/pl-1");
  await expect(handle(page)).toBeVisible();
  await expect(page.locator("[data-slot=toggle-group]").first()).toBeVisible();
  const offscreen = await page.evaluate(
    () => [...document.querySelectorAll("button")].filter((button) => button.getBoundingClientRect().right > window.innerWidth + 1).length,
  );
  expect(offscreen).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await dragBy(page, -10);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "288");
});
