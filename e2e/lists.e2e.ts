import { expect, test, trackTitles } from "./fixtures";

test("j/k move through tracks, enter plays, x and ⇧j select, a queues the selection", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  const rows = page.locator("[aria-label=tracks] tbody tr[data-song-index]");
  await rows.first().focus();
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(rows.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: titles[2] as string })).toBeVisible();

  await page.keyboard.press("x");
  await page.keyboard.press("Shift+j");
  await expect(page.getByRole("toolbar", { name: "selection" })).toContainText("2 selected");
  await page.keyboard.press("a");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "selection" })).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" }).getByText("next in your queue")).toBeVisible();
});

test("arrow keys move through the album grid and enter opens the album", async ({ page, signedIn }) => {
  await signedIn.goto("/albums");
  const cards = page.locator("[data-grid-index] a");
  await expect(cards.first()).toBeVisible();
  const second = (await cards.nth(1).getAttribute("href")) ?? "";
  await cards.first().focus();
  await page.keyboard.press("l");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${second}$`));
});

test("in the queue alt+↓ reorders and delete removes", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.keyboard.press("q");
  const queue = page.getByRole("list", { name: "queue" });
  const options = queue.locator("[data-queue-index]");
  await options.nth(1).locator("button").first().focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(options.nth(2)).toContainText(titles[1] as string);
  await page.keyboard.press("Delete");
  await expect(queue.getByText(titles[1] as string, { exact: true })).toHaveCount(0);
});

test("in the queue a dragged song from your own up-next takes the place of another", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  // The first add starts playing; the next three wait in your queue.
  for (const title of titles.slice(0, 4)) {
    const row = page.getByRole("row", { name: title as string }).first();
    await row.hover();
    await row.getByRole("button", { name: `add ${title} to queue` }).click();
  }
  await page.keyboard.press("q");
  const rows = page
    .getByRole("list", { name: "queue" })
    .locator("li[data-queue-index]")
    .filter({ has: page.locator("[draggable=true]") });
  const text = async (index: number) => (await rows.nth(index).textContent()) ?? "";
  await expect(rows.nth(2)).toBeVisible();
  const [first, last] = [await text(0), await text(2)];
  await rows.nth(2).locator("[draggable=true]").dragTo(rows.nth(0));
  await expect.poll(() => text(0)).toBe(last);
  await expect.poll(() => text(1)).toBe(first);
});
