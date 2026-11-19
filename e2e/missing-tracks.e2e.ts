import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function fakeLyterion(page: Page, added: string[]): Promise<void> {
  await page.route("**/api/wishlist/add", async (route) => {
    added.push((route.request().postDataJSON() as { input: string }).input);
    await route.fulfill({
      json: { recordingId: `wish-${added.length}`, meta: { title: "x", artists: [], durationMs: 0, source: "search", cover: null } },
    });
  });
  const polls = new Map<string, number>();
  await page.route("**/api/wishlist/status", (route) => {
    const id = (route.request().postDataJSON() as { recordingId: string }).recordingId;
    polls.set(id, (polls.get(id) ?? 0) + 1);
    return route.fulfill({ json: polls.get(id) === 1 ? { status: "working", stage: "searching" } : { status: "placed", stage: "placed" } });
  });
}

const rowTexts = (page: Page) => page.getByRole("grid", { name: "tracks" }).locator("tbody tr").allInnerTexts();

test("an album missing tracks shows own x of y and fetch rest adds each missing one", async ({ signedIn: page }) => {
  const added: string[] = [];
  await fakeLyterion(page, added);

  await page.goto("/album/al-5");
  await expect(page.getByText(/^own \d+ of \d+ · 4 not in your library$/)).toBeVisible();
  await page.getByRole("button", { name: "fetch rest" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^fetching \d of 4$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "fetched" })).toBeVisible({ timeout: 40_000 });
  const wanted = ["Middle Cut", "Disc Two Opener", "Bonus Cut 1", "Bonus Cut 2"];
  expect(added.map((input) => wanted.find((title) => input === `Night glass 0 ${title}`))).toEqual(wanted);
});

test("missing tracks sit in album order on their own disc, numbered to fit, and keys and play skip them", async ({ signedIn: page }) => {
  await page.goto("/album/al-5");
  await expect(page.getByText(/not in your library$/).first()).toBeVisible();
  const rows = (await rowTexts(page)).map((text) => text.replace(/\s+/g, " ").trim());
  const at = (text: string) => rows.findIndex((row) => row.includes(text));
  expect(at("Middle Cut")).toBeGreaterThan(0);
  expect(rows[at("Middle Cut")]).toMatch(/^3 Middle Cut/);
  expect(at("Middle Cut")).toBeLessThan(at("disc 2"));
  expect(at("disc 2")).toBeLessThan(at("Disc Two Opener"));
  expect(rows[at("Disc Two Opener")]).toMatch(/^1 Disc Two Opener/);
  expect(at("Bonus Cut 2")).toBe(rows.length - 1);

  const songs = page.locator("[aria-label=tracks] tbody tr[data-song-index]");
  await songs.nth(1).focus();
  await page.keyboard.press("j");
  await expect(songs.nth(2)).toBeFocused();
  await page.keyboard.press("Enter");
  const third = (await songs.nth(2).locator("td").nth(1).innerText()).split("\n")[0] as string;
  await expect(page.getByRole("contentinfo").getByRole("link", { name: third })).toBeVisible();
});

test("a long release keeps its missing rows right when the list is virtualized", async ({ signedIn: page }) => {
  await page.route("**/api/album-tracks/*", async (route) => {
    const answer = (await (await route.fetch()).json()) as { tracks: { title: string; durationMs: number; disc: number }[] };
    const more = Array.from({ length: 110 }, (_, n) => ({ title: `Long Cut ${n + 1}`, durationMs: 60_000, disc: 2 }));
    await route.fulfill({ json: { tracks: [...answer.tracks, ...more] } });
  });
  await page.goto("/album/al-5");
  await expect(page.getByText(/^own 11 of 125 · 114 not in your library$/)).toBeVisible();
  const grid = page.getByRole("grid", { name: "tracks" });
  expect(await grid.locator("tbody tr").count()).toBeLessThan(80);
  await page.getByRole("link", { name: "musicbrainz" }).scrollIntoViewIfNeeded();
  await expect(grid.getByRole("row", { name: /Long Cut 110/ })).toBeVisible();
  await expect(grid.getByRole("row", { name: /Long Cut 110/ })).toContainText("1:00");
});
