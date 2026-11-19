import { expect, test } from "./fixtures";

test("find another cover: pick one, the album shows it at a versioned url, then go back to the original", async ({ signedIn: page }) => {
  await page.goto("/album/al-1");
  const hero = page.locator("img[src^='/cover/']").first();
  await expect(hero).toHaveCSS("opacity", "1");
  expect(await hero.getAttribute("src")).not.toContain("?v=");

  await page
    .getByRole("button", { name: /^more for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "find another cover…" }).click();
  const dialog = page.getByRole("dialog", { name: "find another cover" });
  // Two on Cover Art Archive (the third has no art) and two on Deezer.
  const found = dialog.getByRole("list", { name: "covers found" }).getByRole("button");
  await expect(found).toHaveCount(4);
  await expect(found.first()).toContainText("500 px");
  await expect(dialog.getByText("current", { exact: true })).toBeVisible();

  await found.first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("img[src*='?v=']").first()).toBeVisible();
  const src = (await page.locator("img[src*='?v=']").first().getAttribute("src")) ?? "";
  const served = await page.request.get(src, { headers: { "x-lodesong": "1" } });
  expect(served.headers()["cache-control"]).toContain("immutable");
  expect(served.headers()["content-type"]).toBe("image/png");

  await page
    .getByRole("button", { name: /^more for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "find another cover…" }).click();
  await page.getByRole("button", { name: "use the original cover" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("img[src*='?v=']")).toHaveCount(0);
  await expect(page.locator("img[src^='/cover/']").first()).toBeVisible();
});
