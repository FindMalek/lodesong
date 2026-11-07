import { breakStream, cannotPlay, firstSongOf, outputLevel, outputStates, tapOutput, useQuality } from "./audio";
import { expect, test } from "./fixtures";

// "Playing" in the UI is not sound: these read the signal that reaches the speakers.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(tapOutput);
});

const QUALITIES = [
  ["original", "raw"],
  ["mp3-320", "mp3"],
  ["opus-192", "opus"],
  ["opus-96", "opus"],
  ["auto", "opus"],
] as const;

for (const [quality, format] of QUALITIES) {
  test(`${quality} is audible`, async ({ page, signedIn }) => {
    await useQuality(page, quality);
    await signedIn.goto("/album/al-3");
    const request = page.waitForRequest(
      (candidate) => candidate.url().includes("/rest/stream") && candidate.url().includes(`format=${format}`),
    );
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await request;
    await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
    await expect.poll(() => outputStates(page)).toContain("running");
    await expect.poll(() => outputLevel(page), { timeout: 8000 }).toBeGreaterThan(0.02);
  });
}

const streamsOf = (page: import("@playwright/test").Page, format: string): string[] => {
  const urls: string[] = [];
  page.on(
    "request",
    (request) => request.url().includes("/rest/stream") && request.url().includes(`format=${format}`) && urls.push(request.url()),
  );
  return urls;
};

test("a browser that can't play opus is sent mp3 on auto", async ({ page, signedIn }) => {
  await cannotPlay(page, /ogg|opus/);
  await useQuality(page, "auto");
  const opus = streamsOf(page, "opus");
  const mp3 = streamsOf(page, "mp3");
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect.poll(() => outputLevel(page), { timeout: 8000 }).toBeGreaterThan(0.02);
  expect(opus).toEqual([]);
  expect(mp3.length).toBeGreaterThan(0);
});

// The mock's faults are global: each project breaks songs of its own albums so parallel projects never share one.
const albumFor = (n: number): string => `al-${n + (test.info().project.name === "webkit" ? 1 : 0)}`;

for (const [claims, n, says] of [
  ["says it can't play opus", 7, true],
  ["says it can play opus and fails", 11, false],
] as const) {
  test(`opus that arrives broken in a browser that ${claims} is retried once as mp3 and still plays`, async ({ page, signedIn }) => {
    const album = albumFor(n);
    const song = await firstSongOf(album);
    await breakStream(song, "opus");
    try {
      if (says) await cannotPlay(page, /ogg|opus/);
      await useQuality(page, "opus-192");
      const mp3 = streamsOf(page, "mp3");
      await signedIn.goto(`/album/${album}`);
      await page.getByRole("button", { name: "play", exact: true }).first().click();
      await expect(page.getByText(/plays transcoded/)).toBeVisible({ timeout: 8000 });
      await expect.poll(() => outputLevel(page), { timeout: 8000 }).toBeGreaterThan(0.02);
      expect(mp3.some((url) => url.includes(`id=${song}`))).toBe(true);
    } finally {
      await breakStream(song, "opus", "off");
    }
  });
}

test("a song that can't be played even as mp3 is skipped, not retried forever", async ({ page, signedIn }) => {
  const album = albumFor(9);
  const song = await firstSongOf(album);
  await breakStream(song, "mp3");
  try {
    await cannotPlay(page, /mpeg/);
    await useQuality(page, "mp3-320");
    const mp3 = streamsOf(page, "mp3");
    await signedIn.goto(`/album/${album}`);
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect(page.getByText(/skipped/)).toBeVisible({ timeout: 8000 });
    const forSong = () => mp3.filter((url) => url.includes(`id=${song}`)).length;
    const atSkip = forSong();
    await page.waitForTimeout(2000);
    expect(forSong()).toBe(atSkip);
  } finally {
    await breakStream(song, "mp3", "off");
  }
});
