import type { Page } from "@playwright/test";
import { expect, test, trackTitles } from "./fixtures";

const content = (html: string, property: string): string | undefined =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html)?.[1];

const size = (jpeg: Buffer): [number, number] => {
  let at = 2;
  while (at < jpeg.length) {
    const marker = jpeg.readUInt8(at + 1);
    if (marker >= 0xc0 && marker <= 0xc3) return [jpeg.readUInt16BE(at + 7), jpeg.readUInt16BE(at + 5)];
    at += 2 + jpeg.readUInt16BE(at + 2);
  }
  return [0, 0];
};

test("a pasted album link unfurls: the real album when signed in, a generic card for a crawler", async ({
  page,
  signedIn,
  playwright,
  baseURL,
}) => {
  const album = (await (await page.request.get("/rest/getAlbum?id=al-3&f=json", { headers: { "x-lodesong": "1" } })).json())[
    "subsonic-response"
  ].album as { name: string };

  const member = await (await signedIn.request.get("/album/al-3")).text();
  expect(content(member, "og:title")).toBe(album.name);
  expect(content(member, "og:url")).toBe(`${baseURL}/album/al-3`);
  expect(content(member, "og:image")).toBe(`${baseURL}/og/album/al-3.jpg`);

  const crawler = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "user-agent": "Discordbot/2.0" } });
  const bot = await (await crawler.get("/album/al-3")).text();
  expect(content(bot, "og:title")).toBe("lodesong");
  expect(content(bot, "og:image")).toBe(`${baseURL}/og.jpg`);
  expect(bot).not.toContain(album.name);
  const card = await crawler.get("/og.jpg");
  expect(card.headers()["content-type"]).toBe("image/jpeg");
  expect(size(await card.body())).toEqual([1200, 630]);
  const unsigned = await crawler.get("/og/album/al-3.jpg");
  expect((await unsigned.body()).equals(await card.body())).toBe(true);
  await crawler.dispose();
});

test("copy share link: the link shows the song to a crawler, a changed one shows nothing", async ({
  page,
  signedIn,
  playwright,
  baseURL,
}) => {
  await signedIn.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signedIn.goto("/album/al-3");
  const titles = await trackTitles(page);
  await page
    .getByRole("row", { name: titles[0] as string })
    .first()
    .click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "copy share link" }).click();
  await expect(page.getByText("share link copied")).toBeVisible();

  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.pathname).toMatch(/^\/song\/[^/]+$/);
  expect(link.searchParams.get("s")).toBeTruthy();

  const crawler = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
  const shared = await (await crawler.get(link.pathname + link.search)).text();
  expect(content(shared, "og:title")).toBe(titles[0]);
  expect(content(shared, "og:image")).toContain(`/og/song/${link.pathname.split("/").pop()}.jpg?s=`);
  expect(shared).not.toContain(link.searchParams.get("s") as string);
  const image = await crawler.get((content(shared, "og:image") as string).replace(baseURL as string, ""));
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect(size(await image.body())).toEqual([1200, 630]);

  const token = link.searchParams.get("s") as string;
  const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  const tampered = await (await crawler.get(`${link.pathname}?s=${flipped}`)).text();
  expect(content(tampered, "og:title")).toBe("lodesong");
  await crawler.dispose();
});

async function openTrackMenu(page: Page, index: number): Promise<string> {
  await page.goto("/album/al-3");
  const title = (await trackTitles(page))[index] as string;
  await page.getByRole("row", { name: title }).first().click({ button: "right" });
  return title;
}

async function crawlerTitle(playwright: Parameters<Parameters<typeof test>[2]>[0]["playwright"], baseURL: string, path: string) {
  const crawler = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
  const title = content(await (await crawler.get(path)).text(), "og:title");
  await crawler.dispose();
  return title;
}

test("stop sharing from the toast ends the link", async ({ page, signedIn, playwright, baseURL }) => {
  await signedIn.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const title = await openTrackMenu(page, 2);
  await page.getByRole("menu").getByRole("menuitem", { name: "copy share link" }).click();
  await expect(page.getByText("share link copied")).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(await crawlerTitle(playwright, baseURL as string, link.pathname + link.search)).toBe(title);

  await page.getByRole("button", { name: "stop sharing" }).click();
  await expect(page.getByText("share link stopped")).toBeVisible();
  expect(await crawlerTitle(playwright, baseURL as string, link.pathname + link.search)).toBe("lodesong");
});

test("settings lists the shared links and stops one", async ({ page, signedIn, playwright, baseURL }) => {
  await signedIn.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const title = await openTrackMenu(page, 5);
  await page.getByRole("menu").getByRole("menuitem", { name: "copy share link" }).click();
  await expect(page.getByText("share link copied")).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));

  await signedIn.goto("/settings/account");
  await page
    .getByText("links you copied from an item")
    .locator("xpath=ancestor::div[.//button][1]")
    .getByRole("button", { name: "manage" })
    .click();
  const dialog = page.getByRole("dialog", { name: "shared links" });
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await dialog.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "stop sharing" }).click();
  await expect(dialog.getByText(title, { exact: true })).toBeHidden();
  expect(await crawlerTitle(playwright, baseURL as string, link.pathname + link.search)).toBe("lodesong");
});

test("without a clipboard the link is shown to copy by hand, and a refusal says why", async ({ page, signedIn }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
  await openTrackMenu(signedIn, 9);
  const prompt = page.waitForEvent("dialog");
  await page.getByRole("menu").getByRole("menuitem", { name: "copy share link" }).click();
  const dialog = await prompt;
  expect(dialog.type()).toBe("prompt");
  expect(dialog.defaultValue()).toMatch(/\/song\/[^/]+\?s=/);
  await dialog.dismiss();

  await page.route("**/api/share", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 429, json: { error: "too many share links, try again soon" } })
      : route.fallback(),
  );
  await page.getByRole("row").nth(1).click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: "copy share link" }).click();
  await expect(page.getByText("too many share links, try again soon")).toBeVisible();
});

test("a shared links list that fails to load says so and can be retried", async ({ page, signedIn }) => {
  await signedIn.goto("/settings/account");
  let failing = true;
  await page.route("**/api/share", (route) =>
    failing && route.request().method() === "GET" ? route.fulfill({ status: 500 }) : route.fallback(),
  );
  await page
    .getByText("links you copied from an item")
    .locator("xpath=ancestor::div[.//button][1]")
    .getByRole("button", { name: "manage" })
    .click();
  const dialog = page.getByRole("dialog", { name: "shared links" });
  await expect(dialog.getByRole("alert")).toContainText("couldn't load");
  failing = false;
  await dialog.getByRole("button", { name: "try again" }).click();
  await expect(dialog.getByRole("alert")).toBeHidden();
});
