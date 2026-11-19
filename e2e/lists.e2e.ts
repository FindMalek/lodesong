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
  const all = async () => rows.allTextContents();
  await expect(rows.nth(2)).toBeVisible();
  const [first, middle, last] = await all();
  expect(await rows.count()).toBe(3);
  await rows.nth(2).locator("[draggable=true]").dragTo(rows.nth(0));
  await expect.poll(all).toEqual([last, first, middle]);
  expect(await rows.count()).toBe(3);
});

test("in the queue a song from the context dropped on your own up-next changes nothing", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const added = page.getByRole("row", { name: titles[5] as string }).first();
  await added.hover();
  await added.getByRole("button", { name: `add ${titles[5]} to queue` }).click();
  await page.keyboard.press("q");
  const rows = page
    .getByRole("list", { name: "queue" })
    .locator("li[data-queue-index]")
    .filter({ has: page.locator("[draggable=true]") });
  await expect(rows.nth(2)).toBeVisible();
  const before = await rows.allTextContents();
  await rows.nth(2).locator("[draggable=true]").dragTo(rows.nth(0));
  await rows.nth(0).locator("[draggable=true]").dragTo(rows.nth(2));
  await page.waitForTimeout(300);
  expect(await rows.allTextContents()).toEqual(before);
});

test("the time column sits flush with the right edge of the track list, hovered or not", async ({ page, signedIn }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedIn.goto("/album/al-3");
  const grid = page.getByRole("grid", { name: "tracks" });
  const row = grid.locator("tbody tr[data-song-index]").first();
  await expect(row).toBeVisible();
  const measure = () =>
    grid.evaluate((table) => {
      const textRight = (cell: Element): { left: number; right: number } => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let node = walker.nextNode();
        while (node && !node.textContent?.trim()) node = walker.nextNode();
        if (!node) return { left: 0, right: 0 };
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        return { left: box.left, right: box.right };
      };
      const row = table.querySelector("tbody tr[data-song-index]") as HTMLElement;
      const heads = [...table.querySelectorAll("thead th")];
      const head = heads.find((th) => th.textContent?.trim() === "time") as Element;
      const time = row.querySelectorAll("td")[heads.indexOf(head)] as HTMLElement;
      const box = table.getBoundingClientRect();
      const inner = box.right - Number.parseFloat(getComputedStyle(time).paddingRight);
      const buttons = [...row.querySelectorAll("button")].filter((b) => !time.contains(b));
      return {
        inner,
        time: textRight(time),
        head: textRight(head),
        buttonsRight: Math.max(...buttons.map((b) => b.getBoundingClientRect().right)),
      };
    });
  const check = async (): Promise<void> => {
    const m = await measure();
    expect(m.inner - m.time.right).toBeLessThan(3);
    expect(Math.abs(m.head.right - m.time.right)).toBeLessThan(2);
    expect(m.buttonsRight).toBeLessThanOrEqual(m.time.left);
  };
  await check();
  const before = await grid.boundingBox();
  await row.hover();
  await check();
  expect((await grid.boundingBox())?.width).toBe(before?.width);
  await expect(row.locator("td").last()).toHaveText(/^\s*\d+:\d\d\s*$/);
});
