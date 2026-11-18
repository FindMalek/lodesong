import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function createWith(page: Page, name: string, cover: "four albums" | "animated dither" | "my picture"): Promise<void> {
  await page.locator("body").press("Shift+N");
  const dialog = page.getByRole("dialog", { name: "new playlist" });
  await dialog.getByLabel("name").fill(name);
  if (cover === "my picture")
    await dialog.getByLabel("playlist picture").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PIXEL });
  else await dialog.getByRole("button", { name: cover }).click();
  await dialog.getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

test("a playlist can be created with the four-album mosaic, the animated dither or an uploaded picture", async ({ page, signedIn }) => {
  const stamp = Date.now();
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
  await signedIn.goto("/");

  await createWith(page, `Mosaic ${stamp}`, "four albums");
  await expect(header.locator("canvas")).toHaveCount(0);
  await expect(header.locator("img[src^='/api/playlists/']")).toHaveCount(0);

  await createWith(page, `Dither ${stamp}`, "animated dither");
  await expect(header.locator("canvas").first()).toBeVisible();

  await createWith(page, `Picture ${stamp}`, "my picture");
  await expect(header.locator("img[src^='/api/playlists/']")).toBeVisible();
  const picture = await page.request.get((await header.locator("img[src^='/api/playlists/']").getAttribute("src")) as string);
  expect(picture.headers()["content-type"]).toBe("image/jpeg");
});
