import { expect, test } from "./fixtures";

// Lighthouse sees every request the page starts, so the code of pages nobody opened yet must not race the first screen (1.15.0 lost 0.06 to it).
test("code for the other pages waits for the first tap instead of loading with home", async ({ page, signedIn }) => {
  let scripts = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts += 1;
  });
  await signedIn.goto("/");
  await expect(page.getByRole("heading", { name: "recently added" })).toBeVisible();
  await page.waitForTimeout(1500);
  const before = scripts;
  await page.mouse.click(700, 500);
  await expect.poll(() => scripts - before, { timeout: 4_000 }).toBeGreaterThan(20);
});
