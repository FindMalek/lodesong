import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const FILE = { name: "cover.png", mimeType: "image/png", buffer: PIXEL };

async function create(page: Page, name: string, withPicture: boolean): Promise<void> {
  await page.locator("body").press("Shift+N");
  const dialog = page.getByRole("dialog", { name: "new playlist" });
  await dialog.getByLabel("name").fill(name);
  if (withPicture) {
    await dialog.getByLabel("playlist picture").setInputFiles(FILE);
    await expect(dialog.getByRole("button", { name: "remove picture" })).toBeVisible();
  }
  if (process.env.SHOT) await dialog.screenshot({ path: `${process.env.SHOT}-dialog${withPicture ? "-picture" : ""}.png` });
  await dialog.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

test("a new playlist gets the dither, or your picture; removing the cover goes back to the four-album mosaic", async ({
  page,
  signedIn,
}) => {
  const stamp = Date.now();
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
  const picture = header.locator("img[src^='/api/playlists/']");
  const shot = (suffix: string) => (process.env.SHOT ? header.screenshot({ path: `${process.env.SHOT}-${suffix}.png` }) : undefined);
  if (process.env.SCHEME) await page.emulateMedia({ colorScheme: process.env.SCHEME as "light" | "dark" });
  await signedIn.goto("/");

  await create(page, `Dither ${stamp}`, false);
  await expect(header.locator("canvas").first()).toBeVisible();
  await expect(picture).toHaveCount(0);
  await shot("dither");

  await create(page, `Picture ${stamp}`, true);
  await expect(picture).toBeVisible();
  const served = await page.request.get((await picture.getAttribute("src")) as string);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  await shot("picture");

  await header.getByRole("button", { name: /^more for/ }).click();
  await page.getByRole("menuitem", { name: "remove cover" }).click();
  await expect(picture).toHaveCount(0);
  await expect(header.locator("canvas")).toHaveCount(0);
  await header.getByRole("button", { name: /^more for/ }).click();
  await expect(page.getByRole("menuitem", { name: "add picture" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "remove cover" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await shot("mosaic");

  await header.getByLabel("playlist picture").setInputFiles(FILE);
  await expect(picture).toBeVisible();
  await header.getByRole("button", { name: /^more for/ }).click();
  await expect(page.getByRole("menuitem", { name: "change picture" })).toBeVisible();
});
