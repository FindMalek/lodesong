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

test("page actions match the typed text in any case", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-1");
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill(`play ${title.toLowerCase()}`);
  await expect(dialog.getByRole("group", { name: "this page" }).getByRole("option", { name: /^play / })).toHaveCount(1);
  await dialog.getByRole("combobox").fill(`play ${title.slice(0, 1)}`);
  await expect(dialog.getByRole("group", { name: "this page" }).getByRole("option", { name: /^play / })).toHaveCount(1);
});

test("with the queue open the page actions stay and the queue rows follow", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-1");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await expect(dialog.getByRole("group", { name: "this page" }).getByRole("option")).toHaveText([
    /^play /,
    /add album to queue/,
    /^go to /,
  ]);
  await expect(dialog.getByRole("group", { name: "queue" }).getByRole("option")).toHaveText([/turn shuffle on/, /clear up next/]);
  await dialog.getByRole("option", { name: "turn shuffle on" }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog.getByRole("option", { name: "turn shuffle off" })).toBeVisible();
});
