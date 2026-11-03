import { expect, test } from "./fixtures";

test("choosing français in settings translates the history page, and english comes back", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/appearance");
  await page.getByRole("button", { name: "français" }).click();
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "historique" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.goto("/settings/appearance");
  await page.getByRole("button", { name: "english" }).click();
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "history" })).toBeVisible();
});
