import { expect, test } from "./fixtures";

test("SHYLER and Shyler show as one artist, with both artists' albums on its page, until you unmerge it", async ({ signedIn: page }) => {
  const albums = async (id: string) =>
    (await page.evaluate(async (url) => (await fetch(url, { headers: { "x-lodesong": "1" } })).json(), `/rest/getArtist?f=json&id=${id}`))[
      "subsonic-response"
    ].artist.album.length as number;
  const total = (await albums("ar-11")) + (await albums("ar-12"));

  const artists = async () => {
    await page.goto("/artists");
    await page.getByRole("button", { name: "S", exact: true }).click();
  };
  await artists();
  const rows = page.locator("[data-artist-name]");
  await expect(page.locator('[data-artist-name="Shyler"]')).toHaveCount(1);
  await expect(page.locator('[data-artist-name="SHYLER"]')).toHaveCount(0);
  await expect(rows.filter({ hasText: /^shyler/i })).toHaveCount(1);

  await page.locator('[data-artist-name="Shyler"] a').click();
  await expect(page.getByRole("heading", { name: "Shyler", exact: true })).toBeVisible();
  await expect(page.getByText("merged with: SHYLER")).toBeVisible();
  await expect(page.getByText(`${total} album`, { exact: false }).first()).toBeVisible();
  await expect(page.locator("[data-grid-index]")).toHaveCount(total);

  await page.getByRole("button", { name: "more for Shyler" }).click();
  const saved = page.waitForResponse((response) => response.url().includes("/artists/merges") && response.ok());
  await page.getByRole("menuitem", { name: /unmerge 2 artists/ }).click();
  await saved;
  await artists();
  await expect(page.locator('[data-artist-name="SHYLER"]')).toHaveCount(1);
  await expect(page.locator('[data-artist-name="Shyler"]')).toHaveCount(1);

  // leave the account as found
  await page.locator('[data-artist-name="Shyler"] a').click();
  await page.getByRole("button", { name: "more for Shyler" }).click();
  const restored = page.waitForResponse((response) => response.url().includes("/artists/merges") && response.ok());
  await page.getByRole("menuitem", { name: /^merge 2 artists/ }).click();
  await restored;
  await artists();
  await expect(page.locator('[data-artist-name="SHYLER"]')).toHaveCount(0);
});
