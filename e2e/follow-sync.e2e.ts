import { expect, test } from "./fixtures";

test("sync from spotify follows what lyterion has, and an artist you unfollowed stays unfollowed", async ({ signedIn: page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "following" }).click();
  const dialog = page.getByRole("dialog", { name: "artists you follow" });
  await dialog.getByRole("button", { name: "sync from spotify" }).click();
  await expect(dialog.getByRole("button", { name: "unfollow Glass Harbor" })).toBeVisible();
  await expect(page.getByText(/followed \d new from spotify \(2 there\)/)).toBeVisible();

  await dialog.getByRole("button", { name: "unfollow Glass Harbor" }).click();
  await expect(dialog.getByText("Glass Harbor")).toHaveCount(0);
  await dialog.getByRole("button", { name: "sync from spotify" }).click();
  await expect(page.getByText("already following all 2 from spotify")).toBeVisible();
  await expect(dialog.getByText("Glass Harbor")).toHaveCount(0);
});
