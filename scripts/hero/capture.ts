import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { type Found, signIn } from "./seed";
import { APP } from "./stack";

export type Theme = "dark" | "light";
export type Frame = { name: string; hold: number };

const BASE = `http://127.0.0.1:${APP}`;
const LYRIC_LINES = [2, 3, 4, 5, 6, 7];
const MIN_LYRICS = 10;
const HIDE =
  '[data-sonner-toaster],[data-slot="scroll-area-scrollbar"]{display:none!important}*{caret-color:transparent!important;scrollbar-width:none!important}';

export const HERO_VIEW = { width: 1200, height: 600, scale: 4 / 3 };

const FREEZE = () => {
  const real = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  const clock = window as unknown as { __at?: number };
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    get(this: HTMLMediaElement) {
      return clock.__at ?? real?.get?.call(this);
    },
    set(this: HTMLMediaElement, value: number) {
      if (clock.__at !== undefined) clock.__at = value;
      real?.set?.call(this, value);
    },
  });
  localStorage.setItem("keep-player:onboarded", "hero");
  localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
  localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false, streamQuality: "original" }));
};

export async function open(browser: Browser, theme: Theme, width: number, height: number, scale: number): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript(FREEZE);
  return context;
}

export async function stable(page: Page, clip?: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => null)));
  });
  await page.mouse.move(1, 1);
  let last = "";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(300);
    const png = await page.screenshot({ animations: "disabled", clip });
    const hash = createHash("sha1").update(png).digest("hex");
    if (hash === last) return png;
    last = hash;
  }
  throw new Error("the screen never settled");
}

async function shot(page: Page, dir: string, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  writeFileSync(`${dir}/${name}.png`, await stable(page, clip));
  console.log(`${dir}/${name}.png`);
}

async function freezeAt(page: Page, seconds: number): Promise<void> {
  await page.evaluate((at) => {
    (window as unknown as { __at?: number }).__at = at;
  }, seconds);
}

async function lyricStarts(page: Page, found: Found): Promise<number[]> {
  const album = await page.evaluate(
    async (id) =>
      (await (await fetch(`/rest/getAlbum?id=${id}&f=json`, { headers: { "x-lodesong": "1" } })).json())["subsonic-response"].album,
    found.album,
  );
  const song = album.song.find((item: { title: string }) => item.title === found.title);
  const lyrics = await page.evaluate(
    async (id) =>
      (await (await fetch(`/rest/getLyricsBySongId?id=${id}&f=json`, { headers: { "x-lodesong": "1" } })).json())["subsonic-response"]
        .lyricsList.structuredLyrics[0].line,
    song.id,
  );
  return lyrics.map((line: { start: number }) => line.start / 1000);
}

async function activeIndex(lines: Locator): Promise<number> {
  return lines.evaluateAll((nodes) => {
    const opaque = nodes.flatMap((node, index) => (getComputedStyle(node).opacity === "1" ? [index] : []));
    return opaque.length === 1 ? (opaque[0] ?? -1) : -1;
  });
}

async function expectActive(page: Page, lines: Locator, index: number): Promise<void> {
  await page.mouse.move(1, 1);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await activeIndex(lines)) === index) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`lyric line ${index} never became the active one`);
}

async function playFeatured(page: Page, found: Found): Promise<number[]> {
  await page.goto(`${BASE}/album/${found.album}`);
  await page
    .getByRole("row", { name: new RegExp(found.title) })
    .first()
    .waitFor();
  const starts = await lyricStarts(page, found);
  await freezeAt(page, starts[1] ?? 0);
  await page.locator(`button[aria-label="play ${found.title}"]`).dispatchEvent("click");
  await page.getByRole("contentinfo").getByRole("button", { name: "pause", exact: true }).waitFor();
  await freezeAt(page, starts[1] ?? 0);
  return starts;
}

async function expectHome(page: Page): Promise<void> {
  await page.locator('a[href="/"]:visible').first().click();
  await page.getByText("made for you", { exact: true }).first().waitFor();
  for (const name of ["daily mix 5", "discover weekly", "daylist"])
    await page.getByRole("link", { name }).first().waitFor({ state: "attached" });
}

export async function captureHero(browser: Browser, theme: Theme, found: Found, out: string): Promise<Frame[]> {
  const dir = `${out}/${theme}`;
  mkdirSync(dir, { recursive: true });
  const context = await open(browser, theme, HERO_VIEW.width, HERO_VIEW.height, HERO_VIEW.scale);
  const page = await context.newPage();
  await signIn(page, BASE);
  const starts = await playFeatured(page, found);
  const frames: Frame[] = [];
  const take = async (name: string, hold: number): Promise<void> => {
    await shot(page, dir, name, { x: 0, y: 0, width: HERO_VIEW.width, height: HERO_VIEW.height });
    frames.push({ name, hold });
  };

  await expectHome(page);
  await take("home", 2400);

  await page.locator("body").press("q");
  await page.getByText("now playing", { exact: true }).first().waitFor();
  await take("queue", 2000);
  await page.locator("body").press("q");

  await page.locator("body").press("Shift+F");
  const lines = page.locator('button[title$="click to play from here"]');
  await lines.nth(MIN_LYRICS - 1).waitFor();
  await page
    .getByRole("heading", { name: found.title })
    .or(page.getByText(found.title, { exact: true }))
    .first()
    .waitFor();
  for (const index of LYRIC_LINES) {
    await freezeAt(page, starts[index] ?? 0);
    await lines.nth(index).click();
    await expectActive(page, lines, index);
    await take(`lyrics-${index}`, index === LYRIC_LINES[LYRIC_LINES.length - 1] ? 1800 : 1000);
  }
  await context.close();
  return frames;
}

export const STRIP_VIEW = { width: 1280, height: 720, scale: 2 };

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function captureStrip(browser: Browser, theme: Theme, found: Found, out: string): Promise<void> {
  const dir = `${out}/${theme}`;
  mkdirSync(dir, { recursive: true });
  const context = await open(browser, theme, STRIP_VIEW.width, STRIP_VIEW.height, STRIP_VIEW.scale);
  const page = await context.newPage();
  await signIn(page, BASE);
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    userAgent: PHONE_UA,
  });
  await phone.addInitScript(FREEZE);
  await signIn(await phone.newPage(), BASE);

  await page.goto(`${BASE}/albums`);
  await page
    .getByText(/^\d+ albums$/)
    .first()
    .waitFor();
  await page.locator('a[href^="/album/"] img').nth(20).waitFor();
  await shot(page, dir, "strip-albums");

  await playFeatured(page, found);
  await page.locator("body").press("q");
  await page.getByText("now playing", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "devices" }).click();
  await page.getByText("play on", { exact: true }).waitFor();
  await page.getByText("safari on iphone", { exact: true }).waitFor();
  await shot(page, dir, "strip-queue");
  await phone.close();
  await context.close();
}
