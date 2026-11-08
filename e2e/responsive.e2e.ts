import type { Page } from "@playwright/test";
import { tapOutput } from "./audio";
import { expect, fakeMediaClock, onPhone, test } from "./fixtures";

const SIZES: [number, number][] = [
  [2560, 1440],
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1100, 700],
  [900, 700],
  [768, 1024],
  [600, 800],
  [390, 844],
  [320, 640],
];

const SETTINGS = ["playback", "appearance", "library", "sync", "storage", "lyrics", "shortcuts", "account", "about"];

async function playPlaylist(page: Page): Promise<void> {
  await page.addInitScript(fakeMediaClock);
  await page.goto("/playlist/pl-1");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
}

test("the window is filled exactly at every size: one scrollbar, the bar in view, nothing overlapping or cut off", async ({
  signedIn: page,
}) => {
  test.skip(onPhone(), "it sets desktop window sizes itself");
  test.setTimeout(120_000);
  await playPlaylist(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const found = await page.evaluate(() => {
      const bar = document.querySelector("footer")?.getBoundingClientRect();
      const controls = [...document.querySelectorAll<HTMLElement>("footer button, footer a, footer [role=slider]")]
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter((item) => item.box.width > 0);
      let overlaps = 0;
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i];
          const b = controls[j];
          if (!a || !b || a.element.contains(b.element) || b.element.contains(a.element)) continue;
          if (a.box.left < b.box.right - 1 && b.box.left < a.box.right - 1 && a.box.top < b.box.bottom - 1 && b.box.top < a.box.bottom - 1)
            overlaps += 1;
        }
      return {
        docHeight: document.documentElement.scrollHeight,
        docWidth: document.documentElement.scrollWidth,
        barTop: bar?.top ?? -1,
        barBottom: bar?.bottom ?? -1,
        outside: controls.filter((item) => bar && (item.box.right > bar.right + 1 || item.box.left < bar.left - 1)).length,
        overlaps,
      };
    });
    const at = `${width}x${height}`;
    expect(found.docHeight, `${at}: the document itself scrolls vertically`).toBeLessThanOrEqual(height);
    expect(found.docWidth, `${at}: the document scrolls sideways`).toBeLessThanOrEqual(width);
    expect(found.barTop, `${at}: the player bar is off-screen`).toBeGreaterThan(0);
    expect(found.barBottom, `${at}: the player bar runs past the window`).toBeLessThanOrEqual(height + 1);
    expect(found.outside, `${at}: bar controls leave the bar`).toBe(0);
    expect(found.overlaps, `${at}: bar controls overlap`).toBe(0);
  }
});

test("the bar folds its rarely used controls into a menu as the window narrows", async ({ signedIn: page }) => {
  test.skip(onPhone(), "it hovers the cover on a 2560 px window");
  test.setTimeout(60_000);
  await playPlaylist(page);
  const bar = page.getByRole("contentinfo");

  // Even on a wide screen the sleep timer stays in the menu and song info waits on the cover until you hover it.
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect(bar.getByRole("button", { name: "sleep timer" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "song info" })).toHaveCount(0);
  await bar.locator("img").first().hover();
  await bar.getByRole("button", { name: "song info" }).click();
  await expect(bar.getByRole("button", { name: "song info" })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "song info" }).click();

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(bar.getByRole("button", { name: "shuffle" })).toBeVisible();
  await bar.getByRole("button", { name: "more controls" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "song info" })).toBeVisible();
  await page.getByRole("menuitem", { name: "sleep timer" }).hover();
  await page.getByRole("menuitemradio", { name: "30 minutes" }).click();
  await expect(bar.getByRole("button", { name: "more controls" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  // A phone-sized window keeps play and next, with shuffle, repeat and previous in the menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bar.getByRole("button", { name: "shuffle" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "next" })).toBeVisible();
  await bar.getByRole("button", { name: "more controls" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "shuffle" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "previous" })).toBeVisible();
});

test("on a narrow window a menu button opens the sidebar, and going somewhere closes it", async ({ signedIn: page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.getByRole("button", { name: "open menu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "albums", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "albums", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "open menu" }).click();
  await page.getByRole("link", { name: "albums", exact: true }).click();
  await expect(page).toHaveURL(/\/albums$/);
  await expect(page.getByRole("link", { name: "albums", exact: true })).toHaveCount(0);
});

test("on a narrow window the queue takes the window instead of squeezing the page", async ({ signedIn: page }) => {
  await playPlaylist(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.getByRole("contentinfo");
  await bar.getByRole("button", { name: "queue" }).click();
  const panel = page.getByRole("complementary", { name: "queue" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(380);
  await panel.getByRole("button", { name: "close queue" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Late night" })).toBeVisible();
});

test("a press that is under way when the tooltip code arrives still lands as a click", async ({ signedIn: page }) => {
  await tapOutput(page);
  await page.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await page.reload();
  const queue = page.getByRole("contentinfo").getByRole("button", { name: "queue" });
  await expect(queue).toBeVisible();
  // Slow code, so it lands while the button is held (WebKit drops the click when the pressed button is swapped out).
  await page.route(/chunk-.*\.js/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await queue.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
});

test("on a phone the cover sits at the top of an album's header, beside the title, not at its bottom", async ({ signedIn: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/album/al-13");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const cover = await page.locator("main header img").first().boundingBox();
  const badge = await page.getByText("album", { exact: true }).first().boundingBox();
  expect(cover).not.toBeNull();
  expect(badge).not.toBeNull();
  // Top-aligned: the cover starts level with the first line of the text block, give or take a few pixels.
  expect(Math.abs((cover?.y ?? 0) - (badge?.y ?? 0))).toBeLessThan(8);
});

test("on a phone settings is a tab strip above the content, not a sidebar that squeezes it", async ({ signedIn: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/playback");
  const dialog = page.getByRole("dialog", { name: "settings" });
  const tabs = await dialog.getByRole("tablist").boundingBox();
  const hint = await dialog.locator("p").filter({ hasText: "the next song starts before this one ends" }).boundingBox();
  expect(tabs).not.toBeNull();
  expect(hint).not.toBeNull();
  expect(hint?.width ?? 0).toBeGreaterThan(220);
  expect((hint?.y ?? 0) > (tabs?.y ?? 0) + (tabs?.height ?? 0) - 1).toBe(true);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(wide).toBe(false);
});

for (const width of [320, 390])
  test(`at ${width}px the albums filters sit behind a button`, async ({ signedIn: page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/albums");
    const filters = page.getByRole("button", { name: "filters", exact: true });
    await expect(filters).toBeVisible();
    await expect(page.getByRole("combobox", { name: "genre" })).toBeHidden();
    await filters.click();
    await expect(page.getByRole("combobox", { name: "genre" })).toBeVisible();
    await page.getByRole("button", { name: "unplayed" }).click();
    await expect(page.getByRole("button", { name: "filters · 1" })).toBeVisible();
  });

for (const width of [320, 390])
  test(`at ${width}px the A-Z strip is one scrollable row and the lyrics and doctor tables show every column`, async ({
    signedIn: page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    const albums = Array.from({ length: 3 }, (_, index) => ({
      id: `al-${index}`,
      name: `An album with quite a long name ${index}`,
      artist: "An artist with a long name too",
      total: 12,
      synced: 2,
      plain: 1,
      missing: 9,
    }));
    await page.route("**/api/lyrics/coverage", (route) =>
      route.fulfill({ json: { total: 100, synced: 20, plain: 10, instrumental: 5, missing: 60, unchecked: 5, albums } }),
    );
    await page.route("**/api/doctor", (route) =>
      route.fulfill({
        json: {
          health: 80,
          checks: [
            {
              id: "duplicates",
              title: "possible duplicates",
              hint: "the same song twice",
              count: 2,
              of: 100,
              findings: [
                { label: "An artist with a long name – A song with a long title", detail: "al-1 · 3:45 · FLAC", songId: "so-1" },
                { label: "Another artist – Another song", detail: "al-2 · 4:01 · MP3", songId: "so-2" },
              ],
            },
          ],
        },
      }),
    );

    await page.goto("/artists");
    const strip = page.getByRole("navigation", { name: "jump to letter" });
    await expect(strip).toBeVisible();
    const row = await strip.evaluate((nav) => ({
      scrolls: nav.scrollWidth > nav.clientWidth,
      tops: new Set([...nav.querySelectorAll("button")].map((button) => Math.round(button.getBoundingClientRect().top))).size,
    }));
    expect(row.scrolls).toBe(true);
    expect(row.tops).toBe(1);

    for (const path of ["/lyrics", "/doctor"]) {
      await page.goto(path);
      const table = page.locator("[data-slot=table-container]").first();
      await expect(table).toBeVisible();
      const fits = await table.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
      expect(fits, `${path}: the table scrolls sideways`).toBe(true);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      expect(wide, `${path}: the page scrolls sideways`).toBe(false);
      if (path === "/lyrics") await expect(page.getByRole("columnheader", { name: "synced" })).toBeInViewport();
    }
  });

test("on a phone no paragraph on a page or in settings is squeezed into a few characters a line", async ({ signedIn: page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const paths = ["/", "/albums", "/artists", "/stats", "/history", "/doctor", ...SETTINGS.map((section) => `/settings/${section}`)];
  const squeezed: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const found = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main p, [role=dialog] p")]
        .filter((paragraph) => {
          const box = paragraph.getBoundingClientRect();
          const text = (paragraph.textContent ?? "").trim();
          return box.width > 1 && box.height > 1 && text.split(/\s+/).length > 5 && box.width < 150;
        })
        .map(
          (paragraph) => `${Math.round(paragraph.getBoundingClientRect().width)}px: ${(paragraph.textContent ?? "").trim().slice(0, 40)}`,
        ),
    );
    for (const item of found) squeezed.push(`${path} ${item}`);
  }
  expect(squeezed).toEqual([]);
});
