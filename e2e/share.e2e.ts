import { expect, test, trackTitles } from "./fixtures";

const content = (html: string, property: string): string | undefined =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html)?.[1];

const size = (png: Buffer): [number, number] => [png.readUInt32BE(16), png.readUInt32BE(20)];

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
  expect(content(member, "og:image")).toBe(`${baseURL}/og/album/al-3.png`);

  const crawler = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "user-agent": "Discordbot/2.0" } });
  const bot = await (await crawler.get("/album/al-3")).text();
  expect(content(bot, "og:title")).toBe("lodesong");
  expect(content(bot, "og:image")).toBe(`${baseURL}/og.png`);
  expect(bot).not.toContain(album.name);
  const card = await crawler.get("/og.png");
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(size(await card.body())).toEqual([1200, 630]);
  const unsigned = await crawler.get("/og/album/al-3.png");
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
  expect(content(shared, "og:image")).toContain(`/og/song/${link.pathname.split("/").pop()}.png?s=`);
  expect(shared).not.toContain(link.searchParams.get("s") as string);
  const image = await crawler.get((content(shared, "og:image") as string).replace(baseURL as string, ""));
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(size(await image.body())).toEqual([1200, 630]);

  const tampered = await (await crawler.get(`${link.pathname}?s=${(link.searchParams.get("s") as string).slice(0, -2)}xx`)).text();
  expect(content(tampered, "og:title")).toBe("lodesong");
  await crawler.dispose();
});
