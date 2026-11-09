import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { open } from "../capture";
import { colourCover } from "../cover";
import { type Found, signIn } from "../seed";
import type { Box, Ctx, Device, Lyrics, Recipe, Step, Take } from "./types";

export const FPS = 30;
export const VIEWPORTS: Record<Device, { w: number; h: number; dsf: number }> = {
  desktop: { w: 1440, h: 810, dsf: 2 },
  phone: { w: 390, h: 844, dsf: 3 },
};

const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CALM =
  '[data-slot="scroll-area-scrollbar"]{display:none!important}*{caret-color:transparent!important;scrollbar-width:none!important}';

/** The same clock freeze and onboarding flags the hero capture installs, for a context that has to be a phone. */
const PHONE_INIT = () => {
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

export async function freezeAt(page: Page, seconds: number): Promise<void> {
  await page.evaluate((at) => {
    (window as unknown as { __at?: number }).__at = at;
  }, seconds);
}

/**
 * The hero's `stable()` loop (screenshot until two in a row match), except a focused text field keeps its focus,
 * since a typing sequence needs it, and a toast stays in the picture when the shot asks for it.
 */
async function settle(page: Page, toasts: boolean, park = true): Promise<Buffer> {
  await page.evaluate(
    ([calm, hideToasts]) => {
      let style = document.getElementById("film-calm") as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = "film-calm";
        document.head.append(style);
      }
      style.textContent = calm + (hideToasts ? "[data-sonner-toaster]{display:none!important}" : "");
    },
    [CALM, !toasts] as const,
  );
  await page.evaluate(async () => {
    const active = document.activeElement as HTMLElement | null;
    if (active && !/^(INPUT|TEXTAREA)$/.test(active.tagName) && !active.isContentEditable) active.blur();
    await document.fonts.ready;
    // A lazy image below the fold never loads, so its decode() never settles: give each a moment, not forever.
    const patience = () => new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.all([...document.images].map((image) => Promise.race([image.decode().catch(() => null), patience()])));
  });
  if (park) await page.mouse.move(1, 1);
  let last = "";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(300);
    const png = await page.screenshot({ animations: "disabled" });
    const hash = createHash("sha1").update(png).digest("hex");
    if (hash === last) return png;
    last = hash;
  }
  throw new Error("the screen never settled");
}

const RELEASE_COVER = /release-cover\/(.+)$/;

/** MusicBrainz has no art in the mock, so a release card would be a grey tile: hand the browser a generated dither cover. */
async function coverReleases(context: BrowserContext): Promise<void> {
  await context.route(RELEASE_COVER, (route) => {
    const id = RELEASE_COVER.exec(route.request().url())?.[1] ?? "";
    const seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return route.fulfill({ contentType: "image/png", body: Buffer.from(colourCover(seed, 400)) });
  });
}

async function openContext(browser: Browser, device: Device, theme: Recipe["theme"]): Promise<BrowserContext> {
  const context = await openRaw(browser, device, theme);
  await coverReleases(context);
  return context;
}

async function openRaw(browser: Browser, device: Device, theme: Recipe["theme"]): Promise<BrowserContext> {
  const { w, h, dsf } = VIEWPORTS[device];
  if (device === "desktop") {
    const desktop = await open(browser, theme ?? "dark", w, h, dsf);
    await desktop.grantPermissions(["clipboard-read", "clipboard-write"]);
    return desktop;
  }
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dsf,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme ?? "dark",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    userAgent: PHONE_UA,
  });
  await context.addInitScript(PHONE_INIT);
  return context;
}

async function boxOf(locator: Locator): Promise<Box | null> {
  const found = await locator
    .first()
    .boundingBox({ timeout: 4000 })
    .catch(() => null);
  return found ? { x: found.x, y: found.y, w: found.width, h: found.height } : null;
}

export async function lyricsOf(page: Page, found: Found): Promise<{ id: string; lyrics: Lyrics }> {
  const detail = await page.evaluate(
    async ([albumId, title]) => {
      const call = async (path: string) => (await fetch(path, { headers: { "x-lodesong": "1" } })).json();
      const album = (await call(`/rest/getAlbum?id=${albumId}&f=json`))["subsonic-response"].album;
      const song = album.song.find((item: { title: string }) => item.title === title);
      return { id: song.id as string, lyrics: await call(`/api/lyrics/${encodeURIComponent(song.id)}`) };
    },
    [found.album, found.title] as const,
  );
  return { id: detail.id, lyrics: { title: found.title, lines: detail.lyrics.lines } };
}

async function playFeatured(page: Page, base: string, found: Found, starts: number[]): Promise<void> {
  await page.goto(`${base}/album/${found.album}`);
  await page
    .getByRole("row", { name: new RegExp(found.title) })
    .first()
    .waitFor();
  await freezeAt(page, starts[1] ?? 0);
  await page.locator(`button[aria-label="play ${found.title}"]`).dispatchEvent("click");
  await page.getByRole("contentinfo").getByRole("button", { name: "pause", exact: true }).waitFor();
  await freezeAt(page, starts[1] ?? 0);
}

export type Session = { browser: Browser; base: string; found: Found; starts: number[]; lyrics: Lyrics; out: string };

/** Runs one recipe on a fresh signed-in context and returns what it captured. */
export async function runRecipe(recipe: Recipe, session: Session): Promise<Take> {
  const device = recipe.device ?? "desktop";
  const view = VIEWPORTS[device];
  const dir = `${session.out}/${recipe.id}`;
  mkdirSync(dir, { recursive: true });
  const take: Take = {
    id: recipe.id,
    shot: recipe.shot ?? "tour",
    device,
    theme: recipe.theme ?? "dark",
    w: view.w,
    h: view.h,
    dsf: view.dsf,
    fps: FPS,
    plates: [],
    events: [],
  };
  const context = await openContext(session.browser, device, recipe.theme);
  const extra: BrowserContext[] = [];
  const page = await context.newPage();
  try {
    if (!recipe.anon) await signIn(page, session.base);
    let parked = true;
    const fill = (text: string): string => text.replaceAll("{title}", session.found.title).replaceAll("{album}", session.found.album);
    const at = (): number => take.plates.length / FPS;
    const capture = async (name: string, boxes: Record<string, string> | undefined, toasts: boolean, other?: Page): Promise<void> => {
      const target = other ?? page;
      const found: Record<string, Box> = {};
      for (const [label, selector] of Object.entries(boxes ?? {})) {
        const box = await boxOf(target.locator(fill(selector)));
        if (box) found[label] = box;
        else console.warn(`  ${recipe.id}/${name}: no box for ${label} (${selector})`);
      }
      writeFileSync(`${dir}/${name}.png`, await settle(target, toasts, parked || Boolean(other)));
      const device: Device = other ? "phone" : take.device;
      take.plates.push({
        name,
        file: `${recipe.id}/${name}.png`,
        t: at(),
        boxes: found,
        ...(device === take.device ? {} : { device, ...VIEWPORTS[device] }),
      });
    };
    const ctx: Ctx = {
      page,
      base: session.base,
      found: session.found,
      starts: session.starts,
      lyrics: session.lyrics,
      dir,
      hover: (on) => {
        parked = !on;
      },
      grab: () => settle(page, false, parked),
      take,
      fill,
      event: (kind, more) => take.events.push({ t: at(), kind, ...more }),
      freeze: (seconds) => freezeAt(page, seconds),
      shot: (name, boxes, toasts = false, other) => capture(name, boxes, toasts, other),
      phone: async () => {
        const second = await openContext(session.browser, "phone", recipe.theme);
        extra.push(second);
        const other = await second.newPage();
        await signIn(other, session.base);
        return other;
      },
    };
    if (process.env.FILM_TRACE) console.log(`  ${recipe.id} signed in`);
    if (recipe.needs?.includes("playing")) await playFeatured(page, session.base, session.found, session.starts);
    page.setDefaultTimeout(12_000);
    for (const [index, step] of recipe.steps.entries()) {
      try {
        if (process.env.FILM_TRACE) console.log(`  ${recipe.id} step ${index}`);
        await runStep(step, ctx);
      } catch (error) {
        await page.screenshot({ path: `${dir}/_failed.png` }).catch(() => null);
        throw new Error(
          `${recipe.id} step ${index} ${JSON.stringify(step, (_k, v) => (typeof v === "function" ? "fn" : v))}: ${String(error).split("\n")[0]}`,
        );
      }
    }
  } finally {
    for (const other of extra) await other.close();
    await context.close();
  }
  return take;
}

async function runStep(step: Step, ctx: Ctx): Promise<void> {
  const { page } = ctx;
  if ("go" in step) {
    ctx.hover(false);
    await page.goto(`${ctx.base}${ctx.fill(step.go)}`);
    if (step.ready) await page.locator(ctx.fill(step.ready)).first().waitFor();
  } else if ("key" in step) {
    const target = step.at ? await boxOf(page.locator(ctx.fill(step.at))) : null;
    ctx.event("key", { key: step.key, ...(step.name ? { name: step.name } : {}), ...(target ? { target } : {}) });
    await page.keyboard.press(step.key);
  } else if ("click" in step) {
    const locator = page.locator(ctx.fill(step.click)).first();
    const target = await boxOf(locator);
    ctx.event("click", { ...(step.name ? { name: step.name } : {}), ...(target ? { target } : {}) });
    await locator.click(step.right ? { button: "right" } : {});
  } else if ("type" in step) {
    if (step.into) await page.locator(ctx.fill(step.into)).first().click();
    for (const [index, char] of [...step.type].entries()) {
      ctx.event("type", { key: char });
      await page.keyboard.type(char);
      if (step.each) await ctx.shot(`type-${String(index + 1).padStart(2, "0")}`);
    }
  } else if ("hover" in step) {
    await page.locator(ctx.fill(step.hover)).first().hover();
    ctx.hover(true);
  } else if ("wait" in step) {
    await page.locator(ctx.fill(step.wait)).first().waitFor();
  } else if ("reveal" in step) {
    await page
      .locator(ctx.fill(step.reveal))
      .first()
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
  } else if ("freeze" in step) {
    const seconds = typeof step.freeze === "number" ? step.freeze : (ctx.starts[Number(step.freeze.slice(5))] ?? 0);
    await ctx.freeze(seconds);
  } else if ("shot" in step) {
    await ctx.shot(step.shot, step.boxes, step.toasts);
  } else {
    await step.run(ctx);
  }
}
