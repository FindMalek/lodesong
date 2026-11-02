import { expect, test } from "./fixtures";

test("sync from spotify follows what lyterion has, and an artist you unfollowed stays unfollowed", async ({ signedIn: page }) => {
  await page.goto("/following");
  const followed = page.getByRole("list", { name: "followed artists" });
  await page.getByRole("button", { name: "sync from spotify" }).click();
  await expect(followed.getByRole("button", { name: "unfollow Glass Harbor" })).toBeVisible();
  await expect(page.getByText(/followed \d new from spotify \(2 there\)/)).toBeVisible();

  await followed.getByRole("button", { name: "unfollow Glass Harbor" }).click();
  await expect(followed.getByText("Glass Harbor")).toHaveCount(0);
  await page.getByRole("button", { name: "sync from spotify" }).click();
  await expect(page.getByText("already following all 2 from spotify")).toBeVisible();
  await expect(followed.getByText("Glass Harbor")).toHaveCount(0);
});
