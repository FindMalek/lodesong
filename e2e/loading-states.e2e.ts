import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Routes are held with page.route, which doesn't see requests the service worker makes.
test.use({ serviceWorkers: "block" });

const SLOW_MS = 1500;

function watchShifts(): void {
  const scope = window as unknown as { __cls: number };
  scope.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
      if (!entry.hadRecentInput) scope.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
}

async function slow(page: Page, pattern: string): Promise<void> {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    await route.continue().catch(() => undefined);
  });
}

const cls = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __cls: number }).__cls);

test("following: a skeleton while the follows load, then the list, nothing moves", async ({ page, signedIn }) => {
  await page.addInitScript(watchShifts);
  await signedIn.evaluate(() =>
    fetch("/api/follows", {
      method: "PUT",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ name: "Night Owls", status: "pinned" }),
    }),
  );
  await slow(page, "**/api/rpc/follows**");
  await page.goto("/following");
  await expect(page.getByRole("heading", { name: "your artists" })).toBeVisible();
  const skeleton = page.getByTestId("rows-skeleton");
  await expect(skeleton).toBeVisible();
  const top = (await skeleton.boundingBox())?.y;
  const list = page.getByRole("list", { name: "followed artists" });
  await expect(list).toBeVisible({ timeout: 10_000 });
  // The late "sync from spotify" button nudges the header, so this checks the list itself, not the whole page.
  expect((await list.boundingBox())?.y).toBe(top);
});

test("following with nobody followed says so once loaded", async ({ page, signedIn }) => {
  await page.route("**/api/rpc/**follows**", (route) => route.fulfill({ json: { json: { artists: [] } } }));
  await signedIn.goto("/following");
  await expect(page.getByText("you're not following anyone yet")).toBeVisible();
});

test("folders: a skeleton while the folder tree loads, then folders, nothing moves", async ({ page, signedIn }) => {
  await page.addInitScript(watchShifts);
  await slow(page, "**/rest/getIndexes*");
  await signedIn.goto("/folders");
  await expect(page.getByRole("heading", { name: "folders" })).toBeVisible();
  await expect(page.getByTestId("rows-skeleton")).toBeVisible();
  await expect(page.getByTestId("rows-skeleton")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("main").getByRole("link").first()).toBeVisible();
  expect(await cls(page)).toBe(0);
});

test("a folder that can't be found says so after the skeleton", async ({ page, signedIn }) => {
  await slow(page, "**/api/folders");
  await signedIn.goto("/playlist-folder/nope");
  await expect(page.getByTestId("page-skeleton")).toBeVisible();
  await expect(page.getByTestId("page-skeleton").getByRole("status")).toHaveText("loading");
  await expect(page.getByText("that folder isn't here any more")).toBeVisible({ timeout: 10_000 });
});

test("listen: a skeleton while connecting to a session", async ({ page, signedIn }) => {
  await page.routeWebSocket("**/*", () => undefined);
  await signedIn.goto("/listen/zzzzzz");
  await expect(page.getByTestId("page-skeleton")).toBeVisible({ timeout: 5000 });
});
