import { expect, test } from "./fixtures";

const content = (html: string, property: string): string | undefined =>
  new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html)?.[1];

test("a pasted album link unfurls: the real album when signed in, a generic card for a crawler", async ({
  page,
  signedIn,
  playwright,
  baseURL,
}) => {
  const album = (await (await page.request.get("/rest/getAlbum?id=al-3&f=json", { headers: { "x-lodesong": "1" } })).json())[
    "subsonic-response"
  ].album as { name: string; coverArt: string };

  const member = await (await signedIn.request.get("/album/al-3")).text();
  expect(content(member, "og:title")).toBe(album.name);
  expect(content(member, "og:url")).toBe(`${baseURL}/album/al-3`);
  expect(content(member, "og:image")).toBe(`${baseURL}/cover/${album.coverArt}/600`);

  const crawler = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "user-agent": "Discordbot/2.0" } });
  const bot = await (await crawler.get("/album/al-3")).text();
  expect(content(bot, "og:title")).toBe("lodesong");
  expect(content(bot, "og:image")).toBe(`${baseURL}/og.png`);
  expect(bot).not.toContain(album.name);
  const card = await crawler.get("/og.png");
  expect(card.headers()["content-type"]).toBe("image/png");
  await crawler.dispose();
});
