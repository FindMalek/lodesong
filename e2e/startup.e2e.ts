import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const NEXT = ["AlbumsPage", "SearchPage"];
const REST = ["SettingsPage", "StatsPage", "HistoryPage", "FollowingPage"];

// Lighthouse sees every request the page starts, so the code of pages nobody opened yet must not race the first screen (1.15.0 lost 0.06 to it).
function watchPages(page: Page): (names: string[]) => Promise<string[]> {
  const bodies: Promise<string>[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script")
      bodies.push(
        request
          .response()
          .then((response) => response?.text() ?? "")
          .catch(() => ""),
      );
  });
  return async (names) => {
    const code = (await Promise.all(bodies)).join("\n");
    return names.filter((name) => new RegExp(`export\\{[^}]*\\b${name}\\b`).test(code));
  };
}

test("code for the other pages stays out of the first screen and the first tap", async ({ page, signedIn }) => {
  const loaded = watchPages(page);
  await signedIn.reload();
  await expect(page.getByRole("heading", { name: "recently added" })).toBeVisible();
  await page.waitForLoadState("load");
  await page.getByRole("heading", { name: "recently added" }).click();
  await page.waitForTimeout(1500);
  expect(await loaded([...NEXT, ...REST])).toEqual([]);
});

test("the likely next pages come once nothing has happened for a few seconds, the rest after, and a tap pushes it back", async ({
  page,
  signedIn,
}) => {
  await page.clock.install();
  const loaded = watchPages(page);
  await signedIn.reload();
  await expect(page.getByRole("heading", { name: "recently added" })).toBeVisible();
  await page.waitForLoadState("load");
  await page.clock.runFor(1000);
  await page.getByRole("heading", { name: "recently added" }).click();
  await page.clock.runFor(1500);
  expect(await loaded([...NEXT, ...REST])).toEqual([]);
  await page.clock.runFor(2500);
  await expect.poll(() => loaded(NEXT)).toEqual(NEXT);
  expect(await loaded(REST)).toEqual([]);
  await page.clock.runFor(8000);
  await expect.poll(() => loaded(REST)).toEqual(REST);
});
