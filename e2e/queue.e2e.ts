import { tapOutput } from "./audio";
import { expect, test } from "./fixtures";

test("your queue sits before the album, survives a reload, and saves as a playlist", async ({ page, signedIn }) => {
  await tapOutput(page);
  await signedIn.goto("/album/al-3");
  const name = `e2e queue ${Date.now()}`;
  const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  await page.getByRole("button", { name: "play", exact: true }).first().click();

  // In-app navigation: a full reload here could race the queue's write to IndexedDB.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/album/al-5");
    window.dispatchEvent(new Event("keep:navigate"));
  });
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(title);
  const queued = page.locator("[aria-label=tracks] tbody tr").nth(1);
  const queuedTitle = (await queued.locator("td").nth(1).locator("span").first().textContent()) ?? "";
  await queued.hover();
  await queued.getByRole("button", { name: /^add .* to queue$/ }).click();

  await page.keyboard.press("q");
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel.getByText("next in your queue")).toBeVisible();
  await expect(panel.getByText(`next from ${title}`)).toBeVisible();
  await expect(panel.getByText(queuedTitle, { exact: true })).toBeVisible();

  await page.reload();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" }).getByText(queuedTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "save queue as playlist" }).click();
  await page.getByLabel("playlist name").fill(name);
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("queue times share one right edge, and clearing says undo", async ({ page, signedIn }) => {
  await tapOutput(page);
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const queued = page.locator("[aria-label=tracks] tbody tr").nth(1);
  await queued.hover();
  await queued.getByRole("button", { name: /^add .* to queue$/ }).click();
  await page.keyboard.press("q");
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel.getByText("next in your queue")).toBeVisible();

  const times = panel.locator("[data-queue-index] .tabular-nums");
  await expect.poll(() => times.count()).toBeGreaterThan(2);
  // A mix or audiobook: hours long, the widest time there is.
  await times.nth(1).evaluate((cell) => {
    cell.textContent = "1:02:03";
  });
  const fit = await times.evaluateAll((cells) =>
    cells.map((cell) => ({ right: Math.round(cell.getBoundingClientRect().right), over: cell.scrollWidth > cell.clientWidth })),
  );
  expect(new Set(fit.map((cell) => cell.right)).size).toBe(1);
  expect(fit.some((cell) => cell.over)).toBe(false);

  const clear = panel.getByRole("button", { name: "clear queue" });
  await expect(clear).toHaveAccessibleDescription(/undo brings it back/);
  await clear.click();
  await expect(page.getByText("cleared your queue")).toBeVisible();
  await expect(panel.getByText("next in your queue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "undo" }).last()).toBeVisible();
  await page.locator("body").press("ControlOrMeta+z");
  await expect(panel.getByText("next in your queue")).toBeVisible();
});
