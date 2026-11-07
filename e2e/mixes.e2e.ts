import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const callFrom = (page: Page) => (path: string, init?: { method?: string; body?: string }) =>
  page.evaluate(
    async ([url, options]) => (await fetch(url, { ...options, headers: { "x-lodesong": "1", "content-type": "application/json" } })).json(),
    [path, init ?? {}] as const,
  );

// Mixes are made from the library index and six full listens of one artist (plays only say which artists you like).
async function playOneArtist(page: Page): Promise<void> {
  const call = callFrom(page);
  await call("/api/index", { method: "POST" });
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const random = await call("/rest/getRandomSongs?size=6&f=json");
  const song = (random["subsonic-response"].randomSongs.song as { id: string }[])[0];
  for (let i = 0; i < 6; i++)
    await call("/api/history", {
      method: "POST",
      body: JSON.stringify({ song, started: Date.now() - (i + 1) * 3_600_000, listened: 200, finished: true }),
    });
}

test("mix covers are dithered and drift, and hold one frame under reduced motion", async ({ page, signedIn }) => {
  await playOneArtist(page);
  const cover = () => page.getByRole("list", { name: "made for you" }).locator("canvas").nth(1);
  const snapshot = () => cover().evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedIn.goto("/");
  await expect(cover()).toBeAttached();
  const inked = await cover().evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data ?? [];
    let on = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) on += 1;
    return on / (pixels.length / 4);
  });
  expect(inked).toBeGreaterThan(0.05);
  expect(inked).toBeLessThan(0.7);
  const still = await snapshot();
  await page.waitForTimeout(1_200);
  expect(await snapshot()).toBe(still);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(snapshot, { timeout: 10_000 }).not.toBe(still);
  const moved = await snapshot();
  await expect.poll(snapshot, { timeout: 10_000 }).not.toBe(moved);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(snapshot, { timeout: 10_000 }).toBe(still);
});

test("songs you play become daily mixes on home, saved as navidrome playlists too", async ({ page, signedIn }) => {
  const call = callFrom(page);
  await playOneArtist(page);
  await signedIn.goto("/");
  const mixes = page.getByRole("list", { name: "made for you" });
  await expect(mixes.getByRole("button", { name: "play daily mix 1" })).toBeVisible();
  await expect
    .poll(async () => {
      const playlists = await call("/rest/getPlaylists?f=json");
      return (playlists["subsonic-response"].playlists.playlist as { name: string }[]).some((item) => item.name === "daily mix 1");
    })
    .toBe(true);

  // The card opens the mix as a playlist; the play button on it plays.
  await page.reload();
  await mixes.getByRole("link", { name: "daily mix 1" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("daily mix 1");
  await page.goBack();
  await mixes.getByRole("link", { name: "daily mix 1" }).hover();
  await mixes.getByRole("button", { name: "play daily mix 1" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});
