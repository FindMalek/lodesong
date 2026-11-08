import { mkdirSync } from "node:fs";
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";
import { APP } from "./stack";

type Theme = "dark" | "light";
type Found = { album: string; title: string };

const URL_BASE = `http://127.0.0.1:${APP}`;
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const api = (page: Page, path: string, init?: { method?: string; body?: string }) =>
  page.evaluate(
    async ([target, options]) =>
      (await fetch(target, { ...options, headers: { "x-lodesong": "1", "content-type": "application/json" } })).json(),
    [path, init ?? {}] as const,
  );

async function signIn(page: Page): Promise<void> {
  await page.goto(URL_BASE);
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  await page
    .getByRole("button", { name: "search" })
    .or(page.getByRole("link", { name: "albums", exact: true }))
    .first()
    .waitFor();
}

async function seedHistory(page: Page): Promise<void> {
  await api(page, "/api/index", { method: "POST" });
  for (let attempt = 0; attempt < 60 && (await api(page, "/api/index")).building; attempt += 1) await page.waitForTimeout(500);
  const index = (await api(page, "/rest/getArtists?f=json"))["subsonic-response"].artists.index;
  let played = 0;
  for (const artist of index.flatMap((group: { artist: { id: string }[] }) => group.artist).slice(0, 10)) {
    const detail = (await api(page, `/rest/getArtist?id=${artist.id}&f=json`))["subsonic-response"].artist;
    const album = (await api(page, `/rest/getAlbum?id=${detail.album[0].id}&f=json`))["subsonic-response"].album;
    for (const song of album.song.slice(0, 4))
      for (let repeat = 0; repeat < 2; repeat += 1) {
        played += 1;
        const body = JSON.stringify({ song, started: Date.now() - played * 900_000, listened: 200, finished: true });
        await api(page, "/api/history", { method: "POST", body });
      }
  }
}

async function findSynced(page: Page): Promise<Found> {
  const albums = (await api(page, "/rest/getAlbumList2?type=newest&size=80&f=json"))["subsonic-response"].albumList2.album;
  for (const album of albums.filter((item: { songCount: number }) => item.songCount >= 8)) {
    const full = (await api(page, `/rest/getAlbum?id=${album.id}&f=json`))["subsonic-response"].album;
    for (const song of full.song.slice(2)) {
      const lyrics = (await api(page, `/rest/getLyricsBySongId?id=${song.id}&f=json`))["subsonic-response"].lyricsList.structuredLyrics;
      if (lyrics?.[0]?.synced) return { album: album.id, title: song.title };
    }
  }
  throw new Error("no song with synced lyrics");
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((to) => {
    for (const audio of document.querySelectorAll("audio")) if (audio.currentSrc) audio.currentTime = to;
  }, seconds);
  await page.waitForTimeout(800);
}

async function open(browser: Browser, theme: Theme, phone: boolean): Promise<BrowserContext> {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          colorScheme: theme,
          userAgent: PHONE_UA,
        }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, colorScheme: theme },
  );
  await context.addInitScript(() => {
    localStorage.setItem("keep-player:onboarded", "hero");
    localStorage.setItem("keep-player:tips", JSON.stringify({ off: true, welcomed: true }));
    localStorage.setItem("keep-player:settings", JSON.stringify({ queueSync: false, streamQuality: "original" }));
  });
  return context;
}

async function shot(page: Page, dir: string, name: string): Promise<void> {
  await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(1, 1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${dir}/${name}.png` });
  console.log(`${dir}/${name}.png`);
}

async function playFromRow(page: Page, title: string): Promise<void> {
  await page.locator(`button[aria-label="play ${title}"]`).dispatchEvent("click");
  await page.waitForTimeout(1200);
}

export async function capture(out: string, theme: Theme, seeded: boolean): Promise<void> {
  const dir = `${out}/${theme}`;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const desktop = await (await open(browser, theme, false)).newPage();
  await signIn(desktop);
  if (!seeded) await seedHistory(desktop);
  const found = await findSynced(desktop);
  const handset = await (await open(browser, theme, true)).newPage();
  await signIn(handset);

  await desktop.goto(`${URL_BASE}/album/${found.album}`);
  await desktop
    .getByRole("row", { name: new RegExp(found.title) })
    .first()
    .waitFor();
  await playFromRow(desktop, found.title);

  await desktop.locator("body").press("q");
  await desktop.getByRole("button", { name: "devices" }).click();
  await shot(desktop, dir, "desk-queue");
  await desktop.keyboard.press("Escape");
  await desktop.locator("body").press("q");

  await desktop.locator("body").press("Shift+F");
  await seek(desktop, 27);
  await shot(desktop, dir, "desk-full");
  await desktop.keyboard.press("Escape");

  await desktop.locator('a[href="/"]:visible').first().click();
  await desktop.waitForTimeout(2500);
  await seek(desktop, 41);
  await shot(desktop, dir, "desk-home");
  await desktop.mouse.move(800, 500);
  await desktop.mouse.wheel(0, 190);
  await desktop.waitForTimeout(600);
  await shot(desktop, dir, "desk-scrolled");

  await handset.goto(`${URL_BASE}/album/${found.album}`);
  await handset.locator(`button[aria-label="play ${found.title}"]`).dispatchEvent("click");
  await handset.waitForTimeout(1500);
  await seek(handset, 41);
  const resume = handset.getByRole("contentinfo").getByRole("button", { name: "play", exact: true });
  if (await resume.isVisible()) await resume.click();
  await shot(handset, dir, "phone-album");
  await handset.evaluate(() => {
    history.pushState({}, "", "/");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await handset.waitForTimeout(2000);
  await shot(handset, dir, "phone-home");
  await browser.close();
}
