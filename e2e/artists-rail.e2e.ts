import { expect, test } from "./fixtures";

test.use({ hasTouch: true, isMobile: true });

const SIZES = [390, 360];

for (const width of SIZES)
  test(`the artists letter rail is reachable and jumps to the letter on a ${width}px phone`, async ({ signedIn: page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/artists");
    const rail = page.getByRole("navigation", { name: "jump to letter" });
    const enabled = rail.getByRole("button", { disabled: false });
    await expect(enabled.first()).toBeVisible();
    const letters = await enabled.allInnerTexts();
    const last = letters[letters.length - 1] as string;
    const target = rail.getByRole("button", { name: last, exact: true });

    // The last letter is reachable by scrolling the rail, with a 44px target.
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox()) as NonNullable<Awaited<ReturnType<typeof target.boundingBox>>>;
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);

    // A letter that can reach the top of the page lands below the sticky header, not under it.
    const jump = letters[1] as string;
    await target.click();
    await expect(target).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: jump, exact: true }).click();
    const heading = page.getByRole("heading", { name: jump, exact: true, level: 2 });
    await expect(heading).toBeVisible();
    await expect(async () => {
      const header = (await page.locator("header").first().boundingBox()) as NonNullable<Awaited<ReturnType<typeof target.boundingBox>>>;
      const at = (await heading.boundingBox()) as NonNullable<Awaited<ReturnType<typeof target.boundingBox>>>;
      expect(at.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    }).toPass();
    await expect(page.getByRole("button", { name: jump, exact: true })).toHaveAttribute("aria-current", "true");
  });
