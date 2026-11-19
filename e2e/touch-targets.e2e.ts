import type { Locator, Page } from "@playwright/test";
import { expect, fakeMediaClock, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const MIN = 44;

async function tooSmall(controls: Locator[]): Promise<string[]> {
  const small: string[] = [];
  for (const control of controls) {
    const box = await control.boundingBox();
    if (!box) small.push(`${control}: not on screen`);
    else if (box.width < MIN - 0.5 || box.height < MIN - 0.5) small.push(`${control}: ${box.width}x${box.height}`);
  }
  return small;
}

const bar = (page: Page): Locator[] => [
  page.getByRole("button", { name: "open menu" }),
  page.getByRole("button", { name: "search", exact: true }),
  page.getByRole("button", { name: "demo" }),
];

test("the primary controls on the phone pages are at least 44px", async ({ signedIn: page }) => {
  const pages: [string, Locator[]][] = [
    [
      "/albums",
      [
        page.getByRole("combobox", { name: "sort albums" }),
        page.getByRole("button", { name: "grid" }),
        page.getByRole("button", { name: "list" }),
        page.getByRole("button", { name: "filters" }),
        page.getByRole("button", { name: /^play / }).first(),
      ],
    ],
    [
      "/album/al-3",
      [
        page.getByRole("button", { name: "play", exact: true }).first(),
        page.getByRole("button", { name: "shuffle" }),
        page.getByRole("button", { name: "add to queue", exact: true }),
        page.getByRole("button", { name: "keep offline" }),
        page.getByRole("button", { name: /^like / }).first(),
      ],
    ],
    ["/artist/ar-2", [page.getByRole("button", { name: "radio" }), page.getByRole("button", { name: "shuffle" })]],
    ["/artists", [page.getByRole("button", { name: "A", exact: true }), page.getByRole("button", { name: "liked" })]],
    ["/stats", [page.getByRole("tab", { name: "7 days" }), page.getByRole("tab", { name: "year" })]],
    [
      "/following",
      [page.getByRole("group", { name: "sort artists" }).getByRole("button").first()],
    ],
  ];
  for (const [path, controls] of pages) {
    await page.goto(path);
    await expect(controls[0] as Locator).toBeVisible();
    expect(await tooSmall([...bar(page), ...controls]), path).toEqual([]);
  }
  // The genre tag keeps its look; its hit area grows through a pseudo-element.
  await page.goto("/album/al-3");
  const tag = page.getByRole("link", { name: "classical" });
  const box = (await tag.boundingBox()) as NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
  expect(box.height).toBeLessThan(MIN);
  for (const dy of [-20, 20])
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x as number, y as number)?.getAttribute("href"),
        [box.x + box.width / 2, box.y + box.height / 2 + dy],
      ),
    ).toBe("/genre/Classical");
});

test("track rows keep play, like and more visible on a touch screen", async ({ signedIn: page }) => {
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  await page.goto("/album/al-3");
  const row = page.getByRole("row").nth(1);
  const title = ((await row.getByRole("button", { name: /^like / }).getAttribute("aria-label")) ?? "").slice(5);
  const shown = [
    row.getByRole("button", { name: `play ${title}`, exact: true }),
    row.getByRole("button", { name: `like ${title}` }),
    row.getByRole("button", { name: `more for ${title}` }),
  ];
  for (const control of shown) await expect(control).toBeVisible();
  for (const control of shown) await expect(control).toHaveCSS("opacity", "1");
  expect(await tooSmall(shown)).toEqual([]);
  await expect(row.getByRole("button", { name: `play ${title} next` })).toBeHidden();
  await row.focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe(`play ${title}`);
  await shown[2]?.click();
  await expect(page.getByRole("menuitem").first()).toBeVisible();
});

test("on touch the playing row shows the bars and the others a play button", async ({ signedIn: page }) => {
  await page.addInitScript(fakeMediaClock);
  await page.goto("/album/al-3");
  const rows = page.getByRole("row");
  const label = async (index: number) =>
    (
      (await rows
        .nth(index)
        .getByRole("button", { name: /^like / })
        .getAttribute("aria-label")) ?? ""
    ).slice(5);
  const first = await label(1);
  await rows
    .nth(1)
    .getByRole("button", { name: `play ${first}`, exact: true })
    .click();
  await expect(rows.nth(1).getByRole("img", { name: /^(playing|paused)$/ })).toBeVisible();
  await expect(rows.nth(1).getByRole("button", { name: `play ${first}`, exact: true })).toBeHidden();
  await expect(rows.nth(2).getByRole("button", { name: `play ${await label(2)}`, exact: true })).toBeVisible();
});

test.describe("long list", () => {
  // page.route doesn't see the requests a service worker makes.
  test.use({ serviceWorkers: "block" });

  test("scrolling a long list of 44px rows on touch neither jumps nor leaves gaps", async ({ signedIn: page }) => {
    // An album of 130 tracks by one artist: virtualized, and with no artist line the rows are 34px on a mouse.
    await page.route("**/rest/getAlbum?*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const album = body["subsonic-response"].album;
      const first = album.song;
      album.song = Array.from({ length: 130 }, (_, index) => ({
        ...first[index % first.length],
        id: `long-${index}`,
        track: index + 1,
        discNumber: 1,
      }));
      album.songCount = 130;
      await route.fulfill({ response, json: body });
    });
    await page.goto("/album/al-3");
    const rows = page.locator("[aria-label=tracks] tbody tr[data-index]");
    await expect(rows.first()).toBeVisible();
    const scroller = page.locator("[data-page-scroll]");
    const probe = () =>
      page.evaluate(() => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const all = [...document.querySelectorAll<HTMLElement>("[aria-label=tracks] tbody tr[data-index]")];
        const anchor = all.find((row) => rect(row).top > 250);
        const top = Math.min(...all.map((row) => rect(row).top));
        const gaps = [300, 400, 500, 600, 700].filter((y) => y > top && !document.elementFromPoint(195, y)?.closest("tr"));
        return { index: anchor?.dataset.index, top: anchor ? rect(anchor).top : 0, gaps };
      });
    const height = () => scroller.evaluate((element) => element.scrollHeight);
    const estimated = await height();
    for (let step = 0; step < 12; step += 1) {
      const before = await probe();
      await scroller.evaluate((element) => element.scrollBy(0, 220));
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.waitForTimeout(60);
      const after = await probe();
      if (before.index !== undefined && before.index === after.index)
        expect(Math.abs(before.top - after.top - 220), `step ${step}`).toBeLessThanOrEqual(2);
      expect(after.gaps, `gaps at step ${step}`).toEqual([]);
    }
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await page.waitForTimeout(300);
    await scroller.evaluate((element) => element.scrollTo(0, 0));
    await page.waitForTimeout(300);
    // Rows measured as they scrolled by: the list's height must not have moved, or the scrollbar and position jump.
    expect(Math.abs((await height()) - estimated)).toBeLessThanOrEqual(200);
  });
});
