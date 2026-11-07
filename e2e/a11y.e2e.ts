import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PAGES = [
  "/",
  "/albums",
  "/album/al-3",
  "/artists",
  "/artist/ar-2",
  "/songs",
  "/genres",
  "/import",
  "/doctor",
  "/stats",
  "/listen",
  "/genre/Rock",
  "/folders",
  "/folders/ar-2",
  "/playlist/pl-1",
  "/playlists",
  "/liked",
  "/history",
  "/lyrics",
  "/moments",
  "/radio",
  "/upload",
];

const SETTINGS_TABS = ["playback", "appearance", "sync", "storage", "lyrics", "shortcuts", "account", "about"];

async function violations(page: Page, options: { popupOpen?: boolean } = {}): Promise<string[]> {
  // Let open/close animations finish: half-faded text would be judged on its in-between contrast.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState !== "running"),
  );
  const builder = new AxeBuilder({ page });
  // An open menu is portaled to <body>, outside every landmark; `region` (a best-practice rule, not WCAG) flags it.
  if (options.popupOpen) builder.disableRules(["region"]);
  const result = await builder.analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes
        .map((node) => node.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
}

for (const scheme of ["light", "dark"] as const)
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    for (const path of PAGES)
      test(`no accessibility violations on ${path}`, async ({ page, signedIn }) => {
        // The pointer rests where sign-in left it; a link that ends up under it would open its hover card.
        await page.mouse.move(0, 0);
        await signedIn.goto(path);
        await page.locator("main h1, main [aria-label=tracks], main a").first().waitFor();
        await page.waitForTimeout(300);
        expect(await violations(page)).toEqual([]);
      });

    test("no accessibility violations with the player, panels, palette, cheat sheet and menus open", async ({ page, signedIn }) => {
      await signedIn.goto("/album/al-3");
      await page.getByRole("button", { name: "play", exact: true }).first().click();
      await page.keyboard.press("q");
      await expect(page.getByRole("complementary", { name: "queue" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("y");
      await expect(page.getByRole("complementary", { name: "lyrics" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("ControlOrMeta+k");
      await page.getByRole("dialog", { name: "search" }).getByRole("combobox").fill("night");
      await page.waitForTimeout(500);
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "search" })).toBeHidden();
      await page.locator("body").press("?");
      await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "keyboard shortcuts" })).toBeHidden();
      await page.getByRole("button", { name: /demo$/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(await violations(page, { popupOpen: true })).toEqual([]);
    });

    for (const tab of SETTINGS_TABS)
      test(`no accessibility violations in the settings ${tab} tab`, async ({ page, signedIn }) => {
        await signedIn.goto(`/settings/${tab}`);
        await expect(page.getByRole("dialog", { name: "settings" })).toBeVisible();
        expect(await violations(page, { popupOpen: true })).toEqual([]);
      });

    test("no accessibility violations in the sessions dialog", async ({ page, signedIn }) => {
      await signedIn.goto("/settings/account");
      await page.locator("div").filter({ hasText: "every browser signed in" }).getByRole("button", { name: "manage" }).last().click();
      await expect(page.getByRole("dialog").last()).toBeVisible();
      expect(await violations(page, { popupOpen: true })).toEqual([]);
    });

    test("no accessibility violations on the search results", async ({ page, signedIn }) => {
      const call = (method: string) =>
        page.evaluate(async (verb) => (await fetch("/api/index", { method: verb, headers: { "x-lodesong": "1" } })).json(), method);
      await call("POST");
      await expect.poll(async () => (await call("GET")).building, { timeout: 20_000 }).toBe(false);
      await signedIn.goto("/search?q=ember");
      await expect(page.locator("[data-menu^=top-]")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("no accessibility violations on the login page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "sign in" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });

for (const width of [375, 320])
  test(`phone width ${width}: no violations, no sideways scroll`, async ({ page, signedIn }) => {
    await page.setViewportSize({ width, height: 700 });
    for (const path of ["/", "/album/al-3", "/songs", "/settings/playback"]) {
      await signedIn.goto(path);
      await page.locator("main h1, main [aria-label=tracks], [role=dialog]").first().waitFor();
      await page.waitForTimeout(300);
      expect(await violations(page, { popupOpen: path.startsWith("/settings") })).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
  });

test("each page has one main landmark, one level-one heading and a labelled navigation", async ({ page, signedIn }) => {
  for (const path of PAGES) {
    await signedIn.goto(path);
    await expect(page.locator("main"), path).toHaveCount(1);
    await expect(page.locator("h1:visible"), path).toHaveCount(1);
    expect(await page.locator("nav:not([aria-label]):not([aria-labelledby])").count(), path).toBe(0);
  }
});

test("closing a panel or dialog puts focus back on what opened it", async ({ page, signedIn }) => {
  await signedIn.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  const trigger = page.getByRole("button", { name: /demo$/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});
