import { expect, test } from "./fixtures";

// INP-style: the slowest input event while a 10k-song list is opened, scrolled and played. Set well above an idle runner.
const SLOWEST_EVENT_MS = 250;
const LIST_READY_MS = 2000;

test("10k-song list: opening, scrolling, a panel and starting a song stay under the interaction budget", async ({ page, signedIn }) => {
  await signedIn.evaluate(() => {
    const slow: number[] = [];
    (window as unknown as { __slowEvents: number[] }).__slowEvents = slow;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.entryType === "event") slow.push(entry.duration);
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  });

  const opened = Date.now();
  await signedIn.getByRole("link", { name: "songs", exact: true }).click();
  const rows = page.locator("[aria-label=tracks] tbody tr[data-index]");
  await expect(rows.first()).toBeVisible();
  const listReady = Date.now() - opened;

  const scroller = page.locator("[data-page-scroll]");
  for (let step = 0; step < 5; step += 1) {
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(120);
  }
  await scroller.evaluate((element) => element.scrollTo(0, 0));

  await page.getByRole("button", { name: "shuffle all" }).click();
  await expect(page.getByRole("button", { name: "pause", exact: true }).first()).toBeVisible();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();

  const events = await page.evaluate(() => (window as unknown as { __slowEvents: number[] }).__slowEvents);
  const slowest = Math.max(0, ...events);
  console.info(JSON.stringify({ listReadyMs: listReady, slowestEventMs: Math.round(slowest), slowEvents: events.length }));
  expect(listReady).toBeLessThan(LIST_READY_MS);
  expect(slowest).toBeLessThan(SLOWEST_EVENT_MS);
});
