import type { Page } from "@playwright/test";
import { expect, fakeMediaClock, test } from "./fixtures";

// A fresh server builds its search index after the first sign-in.
async function indexed(page: Page): Promise<void> {
  const call = (method: string) =>
    page.evaluate(async (verb) => (await fetch("/api/index", { method: verb, headers: { "x-lodesong": "1" } })).json(), method);
  await call("POST");
  await expect.poll(async () => (await call("GET")).building, { timeout: 20_000 }).toBe(false);
}

test("⌘K finds a song and picking it plays it", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("ember");
  await expect(dialog.getByRole("group", { name: "songs" })).toBeVisible();
  await dialog.getByRole("group", { name: "songs" }).getByRole("option").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});

test("⌘K: a mood like gym finds its playlists and genres, and the mix plays", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("gym");
  const group = dialog.getByRole("group", { name: "for gym" });
  await expect(group.getByRole("option", { name: /Running/ })).toBeVisible();
  await expect(group.getByRole("option", { name: /Electronic/ })).toBeVisible();
  await group.getByRole("option", { name: /play a mix for gym/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
});

test("⌘K: gym ranks playlists by how their songs sound and says why", async ({ signedIn: page }) => {
  await indexed(page);
  const stored = await page.evaluate(
    async () => (await (await fetch("/api/audiomuse/sync", { method: "POST", headers: { "x-lodesong": "1" } })).json()).stored,
  );
  expect(stored).toBeGreaterThan(100);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("gym");
  const group = dialog.getByRole("group", { name: "for gym" });
  await expect(group.getByRole("option", { name: /Running.*name fits, loud, fast/ })).toBeVisible();
  const favorites = group.getByRole("option", { name: /Favorites/ });
  await expect(favorites).toContainText("loud, fast");
  await expect(favorites).not.toContainText("name fits");
  await expect(group.getByRole("option", { name: /Late night/ })).toBeHidden();
  if (process.env.SHOT) await dialog.screenshot({ path: process.env.SHOT });
  await favorites.click();
  await expect(page).toHaveURL(/\/playlist\/pl-3/);
});

test("⌘K: the gym mix plays the songs the mood search found, not the genre fallback", async ({ signedIn: page }) => {
  await indexed(page);
  const found: string[] = [];
  await page.route("**/api/search?*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.get("q")?.startsWith("energy:high")) return route.continue();
    url.searchParams.set("q", "genre:Jazz");
    const response = await route.fetch({ url: url.toString() });
    const body = (await response.json()) as { songs: { title: string }[] };
    found.push(...body.songs.map((song) => song.title));
    return route.fulfill({ response, json: body });
  });
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("gym");
  await dialog
    .getByRole("group", { name: "for gym" })
    .getByRole("option", { name: /play a mix for gym/ })
    .click();
  const bar = page.getByRole("contentinfo");
  await expect(bar.getByRole("button", { name: "pause" })).toBeVisible();
  await expect
    .poll(async () => {
      const text = await bar.innerText();
      return found.length >= 20 && found.some((title) => text.includes(title));
    })
    .toBe(true);
});

test("⌘K: a mix that was slow to load does not replace the song you started meanwhile", async ({ signedIn: page }) => {
  await indexed(page);
  await page.route("**/api/search?*", async (route) => {
    if (route.request().url().includes("energy")) await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  const dialog = page.getByRole("dialog", { name: "search" });
  await page.keyboard.press("ControlOrMeta+k");
  await dialog.getByRole("combobox").fill("gym");
  await dialog
    .getByRole("group", { name: "for gym" })
    .getByRole("option", { name: /play a mix for gym/ })
    .click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await dialog.getByRole("combobox").fill("ember");
  await dialog.getByRole("group", { name: "songs" }).getByRole("option").first().click();
  const bar = page.getByRole("contentinfo");
  const title = await bar.getByRole("link").first().innerText();
  await page.waitForTimeout(3500);
  await expect(bar.getByRole("link", { name: title, exact: true })).toBeVisible();
});

test("⌘K: the mood group waits for the search, so enter never plays a mix by surprise", async ({ signedIn: page }) => {
  await page.route("**/api/search?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("gym");
  await page.waitForTimeout(600);
  await expect(dialog.getByRole("group", { name: "for gym" })).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "for gym" })).toBeVisible();
});

test("a few words of a lyric find the song, and picking it plays from that line", async ({ page, signedIn }) => {
  await page.addInitScript(fakeMediaClock);
  await signedIn.goto("/");
  const call = (path: string, method = "GET") =>
    page.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-lodesong": "1" } })).json(), [
      path,
      method,
    ] as const);
  // Hits come from the search index, and lyrics enter it once looked up (the backfill is off here).
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const lyrics = await call("/api/lyrics/so-2");
  const line = lyrics.lines[5].text as string;

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  const typo = line.toLowerCase().replace(/^(\w)(\w)/, "$2$1");
  await dialog.getByRole("combobox").fill(`lyrics: ${typo}`);
  const group = dialog.getByRole("group", { name: "lyrics" });
  await expect(group.getByRole("option").first()).toContainText(line);
  await expect(dialog.getByRole("group", { name: "songs" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => seconds(await page.locator("[data-slot=audio-player-time][data-type=current]").textContent()))
    .toBeGreaterThanOrEqual(25);
});

test("typos, artist - title and operators find the right thing, and see all opens the results page", async ({ page, signedIn }) => {
  await signedIn.goto("/");
  const call = (path: string, method = "GET") =>
    page.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-lodesong": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const album = (await call("/rest/getAlbum?f=json&id=al-7"))["subsonic-response"].album;
  const song = album.song[1] as { title: string; artist: string };

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  const box = dialog.getByRole("combobox");
  // "Artist - Title" puts that exact song on top, even with a letter swapped in the title.
  const typo = song.title.replace(/^(\w)(\w)/, "$2$1");
  await box.fill(`${song.artist} - ${typo}`);
  await expect(dialog.getByRole("group", { name: "top result" })).toContainText(song.title);
  await expect(dialog.getByRole("group", { name: "top result" })).toContainText(song.artist);

  // Operators become chips; removing the chip takes it out of the query.
  await box.fill(`year:${album.year} ${album.name}`);
  await expect(dialog.getByText(`year: ${album.year}`)).toBeVisible();
  await expect(
    dialog
      .getByRole("group", { name: "albums" })
      .or(dialog.getByRole("group", { name: "top result" }))
      .first(),
  ).toContainText(album.name);
  await dialog.getByRole("button", { name: "remove year filter" }).click();
  await expect(box).toHaveValue(album.name);

  await dialog.getByRole("button", { name: /see all results/ }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(album.name).replace(/%20/g, "\\+")}`));
  await expect(page.getByRole("main").getByText(album.name).first()).toBeVisible();
});

const seconds = (text: string | null) => (text ?? "0:00").split(":").reduce((total, part) => total * 60 + Number(part), 0);

test("right-click works on results in ⌘K and on the search page", async ({ signedIn: page }) => {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "search" });
  await dialog.getByRole("combobox").fill("ember");
  await dialog.getByRole("group", { name: "songs" }).getByRole("option").first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "add to queue" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.goto("/search?q=ember");
  await page.locator("[data-menu^=top-]").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "start radio" })).toBeVisible();
});
