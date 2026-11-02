import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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

test("the following page finds an artist through a typo, groups releases by week, filters by type and remembers what you saw", async ({
  signedIn: page,
}) => {
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
  const results = page.getByRole("list", { name: "artist results" });
  await results.getByRole("button", { name: `follow ${artist}` }).click();
  const followed = page.getByRole("list", { name: "followed artists" });
  await expect(followed.getByRole("button", { name: `pin ${artist}` })).toBeVisible();
  await followed.getByRole("button", { name: `pin ${artist}` }).click();
  await expect(followed.getByRole("button", { name: `unpin ${artist}` })).toBeVisible();

  const week = page.getByRole("region", { name: /this week|last week/ });
  const card = (artistName: string) => week.getByRole("listitem").filter({ hasText: artistName });
  await expect(async () => {
    await page.reload();
    await expect(week).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await followed.getByRole("button", { name: `unfollow ${artist}` }).click();
  await expect(followed.getByText(artist)).toHaveCount(0);

  const unique = `Seen Test ${Date.now()}`;
  await page.getByRole("textbox", { name: "find an artist to follow" }).fill(unique);
  await page
    .getByRole("list", { name: "artist results" })
    .getByRole("button", { name: `follow ${unique}` })
    .click();
  await expect(async () => {
    await page.reload();
    await expect(card(unique).getByText("Late Single")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await page.getByRole("button", { name: "albums" }).click();
  await expect(card(unique)).toHaveCount(0);
  await page.getByRole("button", { name: "singles" }).click();
  await expect(card(unique).getByText("single · ")).toBeVisible();

  await card(unique).getByRole("button", { name: "mark Late Single seen" }).click();
  await expect(card(unique).getByRole("button", { name: "mark Late Single seen" })).toHaveCount(0);
  await page.reload();
  await expect(card(unique).getByText("Late Single")).toBeVisible();
  await expect(card(unique).getByRole("button", { name: "mark Late Single seen" })).toHaveCount(0);

  await page
    .getByRole("list", { name: "followed artists" })
    .getByRole("button", { name: `unfollow ${unique}` })
    .click();
  await expect(page.getByRole("list", { name: "followed artists" }).getByText(unique)).toHaveCount(0);
});
