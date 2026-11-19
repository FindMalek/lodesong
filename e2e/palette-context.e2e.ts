import { expect, test } from "./fixtures";

test("⌘K on an album page leads with that album's actions", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  const group = dialog.getByRole("group", { name: "this page" });
  await expect(group.getByRole("option")).toHaveText([/^play /, /add album to queue/, /^go to /]);
  await group.getByRole("option", { name: /^go to / }).click();
  await expect(page).toHaveURL(/\/artist\//);
});

test("⌘K opens with its data ready: no wait for genres, even when the server is slow", async ({ page, signedIn }) => {
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("getGenres"))))
    .toBe(true);
  await page.route("**/rest/getGenres*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await signedIn.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("gym");
  await expect(dialog.getByRole("group", { name: "for gym" }).getByRole("option", { name: /Electronic/ })).toBeVisible({ timeout: 1000 });
});

test("the palette dims and blurs only the overlay", async ({ page, signedIn }) => {
  await signedIn.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "search" })).toBeVisible();
  const filter = await page.locator("[data-slot=dialog-overlay]").evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(filter).toBe("blur(8px)");
});
