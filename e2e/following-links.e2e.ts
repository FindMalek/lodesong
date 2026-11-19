import { expect, test } from "./fixtures";

test("followed names open the artist, the badge explains itself, and an unfollow can be undone", async ({ signedIn: page }) => {
  const call = (path: string, method = "GET") =>
    page.evaluate(async ([url, verb]) => (await fetch(url, { method: verb, headers: { "x-lodesong": "1" } })).json(), [
      path,
      method,
    ] as const);
  await call("/api/index", "POST");
  await expect.poll(async () => (await call("/api/index")).building, { timeout: 20_000 }).toBe(false);
  const artist = (await call("/rest/getArtist?f=json&id=ar-3"))["subsonic-response"].artist.name as string;

  await page.goto("/following");
  const followed = page.getByRole("list", { name: "followed artists" });
  await page.getByRole("textbox", { name: "find an artist to follow" }).fill(artist);
  await page
    .getByRole("list", { name: "artist results" })
    .getByRole("button", { name: `follow ${artist}` })
    .click();
  await expect(followed.getByRole("link", { name: artist })).toHaveAttribute("href", "/artist/ar-3");

  await followed.getByRole("button", { name: `pin ${artist}` }).click();
  await expect(followed.getByText("pinned", { exact: true })).toHaveAttribute("title", /sort first/);

  await followed.getByRole("button", { name: `unfollow ${artist}` }).click();
  await expect(followed.getByText(artist)).toHaveCount(0);
  await page.getByRole("button", { name: "undo" }).click();
  await expect(followed.getByRole("link", { name: artist })).toBeVisible();
  await expect(followed.getByText("pinned", { exact: true })).toBeVisible();

  await followed.getByRole("button", { name: `unfollow ${artist}` }).click();
});
