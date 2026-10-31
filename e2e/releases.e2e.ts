import { expect, test } from "./fixtures";

test("a followed artist's new release is listed with its date and a link, and 'get it' hands it to lyterion", async ({
  signedIn: page,
}) => {
  await page.evaluate(() =>
    fetch("/api/follows", {
      method: "PUT",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ name: "Night Owls", status: "pinned" }),
    }),
  );
  await page.goto("/");
  const row = page.getByRole("list", { name: "new releases" });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(row.getByText("Fresh Hours")).toBeVisible();
  await expect(row.getByText("Live In Nowhere")).toHaveCount(0);
  await expect(row.getByRole("link", { name: "Fresh Hours on musicbrainz" })).toHaveAttribute(
    "href",
    /musicbrainz\.org\/release-group\/rg-fresh-hours/,
  );

  await row.getByRole("button", { name: "get Fresh Hours" }).click();
  await expect(row.getByText("asked lyterion")).toBeVisible();

  await page.getByRole("button", { name: "following" }).click();
  const dialog = page.getByRole("dialog", { name: "artists you follow" });
  await expect(dialog.getByRole("button", { name: "unpin Night Owls" })).toBeVisible();
  await dialog.getByRole("button", { name: "unfollow Night Owls" }).click();
  await expect(dialog.getByText("Night Owls")).toHaveCount(0);
});
