import type { Page } from "@playwright/test";
import { expect, signIn, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

async function follow(page: Page, name: string): Promise<void> {
  await page.evaluate(
    (artist) =>
      fetch("/api/follows", {
        method: "PUT",
        headers: { "x-lodesong": "1", "content-type": "application/json" },
        body: JSON.stringify({ name: artist, status: "pinned" }),
      }),
    name,
  );
}

test("a followed artist's new release is a card with its type, date and link, and 'get it' hands it to lyterion", async ({
  signedIn: page,
}) => {
  await follow(page, "Night Owls");
  await page.goto("/");
  const row = page.getByRole("list", { name: "new releases" });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  const card = row.getByRole("listitem").filter({ hasText: "Fresh Hours" });
  await expect(card.getByText("Night Owls")).toBeVisible();
  await expect(card.getByText(/^album · /)).toBeVisible();
  await expect(row.getByText("Live In Nowhere")).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Fresh Hours on musicbrainz" })).toHaveAttribute(
    "href",
    /musicbrainz\.org\/release-group\/rg-fresh-hours/,
  );

  await card.getByRole("button", { name: "get Fresh Hours" }).click();
  await expect(card.getByText("asked lyterion")).toBeVisible();
  await expect(card.getByText("new", { exact: true })).toHaveCount(0);
});

test("a followed artist's new songs go into the release radar, not onto the following page as cards", async ({ page }) => {
  await signIn(page, "radar");
  const call = (path: string, init?: { method?: string; body?: string }) =>
    page.evaluate(
      async ([url, options]) =>
        (await fetch(url, { ...options, headers: { "x-lodesong": "1", "content-type": "application/json" } })).json(),
      [path, init ?? {}] as const,
    );
  const artist = (await call("/rest/getArtist?f=json&id=ar-0"))["subsonic-response"].artist as { album: { id: string }[] };
  const album = (await call(`/rest/getAlbum?f=json&id=${artist.album[0]?.id}`))["subsonic-response"].album;
  const song = album.song[0] as { id: string; artist: string };
  await fetch(`${process.env.E2E_MOCK_URL}/mock/added?id=${song.id}`, { method: "POST" });
  try {
    await call("/api/history", {
      method: "POST",
      body: JSON.stringify({ song, started: Date.now() - 3_600_000, listened: 200, finished: true }),
    });
    await follow(page, song.artist);

    // Other specs index the shared library too; reindex until a run has read the song marked above.
    const radar = page.getByRole("list", { name: "made for you" }).getByRole("button", { name: "play release radar" });
    await expect(async () => {
      await call("/api/index", { method: "POST" });
      await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
      await page.goto("/");
      await expect(radar).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 40_000 });

    await page.goto("/following");
    await expect(page.getByRole("list", { name: "followed artists" }).getByText(song.artist)).toBeVisible();
    await expect(page.getByRole("heading", { name: "new releases" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^get / })).toHaveCount(0);
  } finally {
    await fetch(`${process.env.E2E_MOCK_URL}/mock/added?id=${song.id}&mode=off`, { method: "POST" });
    await call("/api/index", { method: "POST" });
  }
});

test("the following page finds an artist through a typo, pins and unfollows it", async ({ signedIn: page }) => {
  const call = (path: string, method = "GET") =>
    page.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-lodesong": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const artist = (await call("/rest/getArtist?f=json&id=ar-3"))["subsonic-response"].artist.name as string;

  await page.goto("/following");
  await page.getByRole("textbox", { name: "find an artist to follow" }).fill(artist.replace(/^(\w)(\w)/, "$2$1"));
  await page
    .getByRole("list", { name: "artist results" })
    .getByRole("button", { name: `follow ${artist}` })
    .click();
  const followed = page.getByRole("list", { name: "followed artists" });
  await expect(followed.getByRole("button", { name: `pin ${artist}` })).toBeVisible();
  await followed.getByRole("button", { name: `pin ${artist}` }).click();
  await expect(followed.getByRole("button", { name: `unpin ${artist}` })).toBeVisible();
  await followed.getByRole("button", { name: `unfollow ${artist}` }).click();
  await expect(followed.getByText(artist)).toHaveCount(0);
});
