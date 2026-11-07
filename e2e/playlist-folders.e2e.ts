import { expect, test } from "./fixtures";

test("a real folder takes a dragged playlist, keeps its name, remembers it is open, and gives the playlist back when deleted", async ({
  page,
  signedIn,
}) => {
  const stamp = Date.now();
  const playlist = `Late ${stamp}`;
  const folder = `Shelf ${stamp}`;
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await page.locator("body").press("Shift+N");
  await page.getByRole("dialog", { name: "new playlist" }).getByLabel("name").fill(playlist);
  await page.getByRole("dialog", { name: "new playlist" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(playlist);

  await page.getByRole("button", { name: "new folder", exact: true }).click();
  await page.getByRole("dialog", { name: "new folder" }).getByLabel("name").fill(folder);
  await page.getByRole("dialog", { name: "new folder" }).getByRole("button", { name: "create" }).click();
  await expect(page).toHaveURL(/\/playlist-folder\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(folder);

  await sidebar.getByRole("link", { name: playlist }).dragTo(sidebar.getByRole("button", { name: folder, exact: true }));
  await expect(sidebar.getByRole("link", { name: playlist })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: playlist })).toBeVisible();
  await page.reload();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: playlist })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: playlist })).toBeVisible();

  await sidebar.getByRole("button", { name: folder, exact: true }).click();
  await expect(sidebar.getByRole("link", { name: playlist })).toBeVisible();
  await page.reload();
  await expect(sidebar.getByRole("link", { name: playlist })).toBeVisible();
  await sidebar.getByRole("link", { name: playlist }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(playlist);

  await sidebar.getByRole("button", { name: `folder ${folder}: rename or add a playlist` }).click({ force: true });
  await page.getByRole("dialog").getByRole("button", { name: "delete" }).click();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: playlist })).toBeVisible();
});

test("a Folder / Name playlist group becomes a real folder in one click, names untouched", async ({ page, signedIn }) => {
  const stamp = Date.now();
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await page.locator("body").press("Shift+N");
  await page.getByRole("dialog", { name: "new playlist" }).getByLabel("name").fill(`Old ${stamp} / Night`);
  await page.getByRole("dialog", { name: "new playlist" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Night");

  await sidebar.getByRole("button", { name: `folder Old ${stamp}: rename or add a playlist` }).click({ force: true });
  await page.getByRole("dialog").getByRole("button", { name: "make it a real folder" }).click();
  await sidebar.getByRole("link", { name: `open folder Old ${stamp}` }).click({ force: true });
  await expect(page.getByRole("main").getByRole("link", { name: "Night" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Night" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Night");
});
