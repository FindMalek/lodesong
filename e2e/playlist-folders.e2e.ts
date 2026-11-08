import type { Page } from "@playwright/test";
import { expect, test, trackTitles } from "./fixtures";

async function playlistWithSongs(page: Page, name: string): Promise<void> {
  await page.goto("/album/al-27");
  const titles = await trackTitles(page);
  for (const title of titles.slice(0, 2))
    await page
      .getByRole("row", { name: title })
      .first()
      .locator("td")
      .nth(1)
      .click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("toolbar", { name: "selection" }).getByRole("button", { name: "add to playlist" }).click();
  await page.getByRole("menuitem", { name: "new playlist…" }).click();
  await page.getByRole("dialog", { name: "new playlist" }).getByLabel("name").fill(name);
  await page.getByRole("dialog", { name: "new playlist" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

async function emptyPlaylist(page: Page, name: string): Promise<void> {
  await page.locator("body").press("Shift+N");
  await page.getByRole("dialog", { name: "new playlist" }).getByLabel("name").fill(name);
  await page.getByRole("dialog", { name: "new playlist" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" / ").at(-1) as string);
}

async function folderWithPlaylist(page: Page, name: string, playlistId: string): Promise<string> {
  const headers = { "x-lodesong": "1" };
  const made = await page.request.post("/api/folders", { headers, data: { name, parentId: null } });
  const folder = (await made.json()) as { id: string };
  const placed = await page.request.put(`/api/playlists/${playlistId}/folder`, { headers, data: { folderId: folder.id } });
  expect(placed.ok()).toBe(true);
  return folder.id;
}

test("a real folder takes a dragged playlist, keeps its name, remembers it is open, and gives the playlist back when deleted", async ({
  page,
  signedIn,
}) => {
  const stamp = Date.now();
  const playlist = `Late ${stamp}`;
  const folder = `Shelf ${stamp}`;
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await emptyPlaylist(page, playlist);

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
  await page.getByRole("dialog").getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(`delete ${folder}?`)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "keep it" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "delete", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "delete folder" }).click();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: playlist })).toBeVisible();
});

test("a Folder / Name playlist group becomes a real folder in one click, names untouched", async ({ page, signedIn }) => {
  const stamp = Date.now();
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await emptyPlaylist(page, `Old ${stamp} / Night`);

  await sidebar.getByRole("button", { name: `folder Old ${stamp}: rename or add a playlist` }).click({ force: true });
  await page.getByRole("dialog").getByRole("button", { name: "make it a real folder" }).click();
  await sidebar.getByRole("link", { name: `open folder Old ${stamp}` }).click({ force: true });
  await expect(page.getByRole("main").getByRole("link", { name: "Night" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Night" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Night");
});

test("a playlist moves without dragging, and dragging it over another playlist never adds its songs there", async ({ page, signedIn }) => {
  const stamp = Date.now();
  const [mover, other, folder] = [`Mover ${stamp}`, `Other ${stamp}`, `Box ${stamp}`];
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await emptyPlaylist(page, other);
  await playlistWithSongs(page, mover);
  await page.getByRole("button", { name: "new folder", exact: true }).click();
  await page.getByRole("dialog", { name: "new folder" }).getByLabel("name").fill(folder);
  await page.getByRole("dialog", { name: "new folder" }).getByRole("button", { name: "create" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(folder);

  const writes: string[] = [];
  page.on("request", (request) => {
    if (/updatePlaylist/.test(request.url())) writes.push(request.url());
  });
  await sidebar.getByRole("link", { name: mover }).dragTo(sidebar.getByRole("link", { name: other }));
  await page.waitForTimeout(500);
  expect(writes).toEqual([]);

  await sidebar.getByRole("link", { name: mover }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "move to folder…" }).click();
  const dialog = page.getByRole("dialog", { name: "move to folder" });
  await dialog.getByLabel("folder").selectOption({ label: folder });
  await dialog.getByRole("button", { name: "move" }).click();
  await expect(sidebar.getByRole("link", { name: mover })).toHaveCount(0);
  await sidebar.getByRole("button", { name: folder, exact: true }).click();
  await sidebar.getByRole("link", { name: mover }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(mover);

  await page.getByRole("button", { name: "move to folder" }).click();
  const again = page.getByRole("dialog", { name: "move to folder" });
  await expect(again.getByLabel("folder")).not.toHaveValue("");
  await again.getByLabel("folder").selectOption({ label: "top level" });
  await again.getByRole("button", { name: "move" }).click();
  await page.reload();
  await expect(sidebar.getByRole("link", { name: mover })).toBeVisible();
  expect(writes).toEqual([]);
});

test("the sidebar waits for the folders instead of showing every playlist flat, and keeps them when they can't load", async ({
  page,
  browser,
  context,
  signedIn,
}) => {
  const stamp = Date.now();
  const [playlist, folder] = [`Held ${stamp}`, `Held shelf ${stamp}`];
  await signedIn.goto("/");
  await emptyPlaylist(page, playlist);
  await folderWithPlaylist(page, folder, page.url().split("/").at(-1) as string);

  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: await context.storageState() });
  const cold = await fresh.newPage();
  await cold.addInitScript(() => localStorage.setItem("keep-player:onboarded", "test"));
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await cold.route("**/api/folders", async (route) => {
    await held;
    await route.continue();
  });
  const playlists = cold.waitForResponse((response) => response.url().includes("getPlaylists"));
  await cold.goto("/");
  await playlists;
  await cold.waitForTimeout(400);
  const sidebar = cold.getByRole("navigation", { name: "sidebar" });
  await expect(sidebar.getByRole("link", { name: playlist })).toHaveCount(0);
  release();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: playlist })).toHaveCount(0);

  await cold.waitForTimeout(1500);
  await cold.unroute("**/api/folders");
  await cold.route("**/api/folders", (route) => route.abort());
  await cold.reload();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: playlist })).toHaveCount(0);
  await fresh.close();
});

test("a folder page says it couldn't load the folders, instead of calling the folder gone", async ({ browser, context, signedIn }) => {
  await signedIn.goto("/");
  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: await context.storageState() });
  const cold = await fresh.newPage();
  await cold.addInitScript(() => localStorage.setItem("keep-player:onboarded", "test"));
  await cold.route("**/api/folders", (route) => route.abort());
  await cold.goto("/playlist-folder/nope");
  await expect(cold.getByText("couldn't load your folders")).toBeVisible();
  await expect(cold.getByText("that folder isn't here any more")).toHaveCount(0);
  await cold.unroute("**/api/folders");
  await cold.getByRole("button", { name: "try again" }).click();
  await expect(cold.getByText("that folder isn't here any more")).toBeVisible();
  await fresh.close();
});

test("a folder stays open when the saved folder list is older than the folder", async ({ page, signedIn }) => {
  const stamp = Date.now();
  const [playlist, folder] = [`Old list ${stamp}`, `Old list shelf ${stamp}`];
  const sidebar = page.getByRole("navigation", { name: "sidebar" });
  await signedIn.goto("/");
  await emptyPlaylist(page, playlist);
  await page.waitForTimeout(1500);
  const id = await folderWithPlaylist(page, folder, page.url().split("/").at(-1) as string);
  await page.evaluate((open) => localStorage.setItem("lodesong:folders-open", JSON.stringify([open])), id);
  await page.route("**/api/folders", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(sidebar.getByRole("button", { name: folder, exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: playlist })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lodesong:folders-open"))).toContain(id);
});

test("a folder without a picture gets a dithered aura that holds one frame under reduced motion, a picture replaces it", async ({
  page,
  signedIn,
}) => {
  const made = await page.request.post("/api/folders", {
    headers: { "x-lodesong": "1" },
    data: { name: `Dither ${Date.now()}`, parentId: null },
  });
  const { id } = (await made.json()) as { id: string };
  const cover = page.locator("main div.size-40");
  const dots = cover.locator("canvas").nth(1);
  const snapshot = () => dots.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedIn.goto(`/playlist-folder/${id}`);
  await expect(cover.locator("canvas")).toHaveCount(2);
  await expect(dots).toHaveAttribute("aria-hidden", "true");
  const inked = await dots.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext("2d")?.getImageData(0, 0, element.width, element.height).data ?? [];
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  });
  expect(inked).toBe(true);
  const still = await snapshot();
  await page.waitForTimeout(1_200);
  expect(await snapshot()).toBe(still);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(snapshot, { timeout: 10_000 }).not.toBe(still);

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByRole("button", { name: "edit" }).click();
  await page.getByLabel("folder picture").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "save" }).click();
  await expect(cover.locator("img")).toBeVisible();
  await expect(cover.locator("canvas")).toHaveCount(0);
});

test("a folder page full of dithered covers keeps one 500 ms timer, not one each", async ({ page, signedIn }) => {
  const headers = { "x-lodesong": "1" };
  const make = async (name: string, parentId: string | null) =>
    ((await (await page.request.post("/api/folders", { headers, data: { name, parentId } })).json()) as { id: string }).id;
  const stamp = Date.now();
  const parent = await make(`Shelf ${stamp}`, null);
  for (const name of ["a", "b", "c", "d"]) await make(`${name} ${stamp}`, parent);
  await page.addInitScript(() => {
    const live = new Set<number>();
    const [set, clear] = [window.setInterval.bind(window), window.clearInterval.bind(window)];
    Object.assign(window, {
      liveFrames: () => live.size,
      setInterval: (run: TimerHandler, ms?: number, ...rest: unknown[]) => {
        const id = set(run, ms, ...rest);
        if (ms === 500) live.add(id);
        return id;
      },
      clearInterval: (id?: number) => {
        live.delete(id ?? 0);
        clear(id);
      },
    });
  });
  await signedIn.goto(`/playlist-folder/${parent}`);
  await expect(page.locator("main canvas")).toHaveCount(10);
  const live = () => page.evaluate(() => (window as unknown as { liveFrames: () => number }).liveFrames());
  expect(await live()).toBe(1);
});
