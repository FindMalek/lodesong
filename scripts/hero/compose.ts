import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { type Frame, HERO_VIEW, STRIP_VIEW, type Theme } from "./capture";
import { animate, decodedFrames, regions } from "./webp";

const BORDER: Record<Theme, string> = { dark: "#262626", light: "#c5c5c5" };
const CARD: Record<Theme, string> = { dark: "#191919", light: "#f5f5f5" };
const BG: Record<Theme, string> = { dark: "#101010", light: "#ebebeb" };
const FG: Record<Theme, string> = { dark: "#ebebeb", light: "#101010" };
const MUTED: Record<Theme, string> = { dark: "#9a9a9a", light: "#585858" };
const MIN_BYTES = 250_000;
const MAX_BYTES = 2_000_000;
const MIN_STRIP_BYTES = 60_000;
const MAX_STRIP_BYTES = 400_000;
const STRIP = { width: 1600, height: 560 };
const CARD_WIDTH = 784;
const HEAD = 76;
const BODY = STRIP.height - HEAD - 2;
const inset = (theme: Theme): string => `left:16px;top:${HEAD + 4}px;width:750px;height:${BODY - 20}px;border:1px solid ${BORDER[theme]}`;
const ZOOM = 1.3;

type Crop = { src: string; x: number; y: number; zoom?: number; inset?: string };

function fontFace(family: string, spec: string, weights: string): string {
  const path = Bun.resolveSync(spec, `${process.cwd()}/apps/api`);
  return `@font-face{font-family:"${family}";src:url("file://${path}") format("woff2");font-weight:${weights}}`;
}

function crop(spec: Crop, style: string): string {
  const zoom = spec.zoom ?? ZOOM;
  const image = `<img src="file://${spec.src}" style="width:${STRIP_VIEW.width * zoom}px;left:${-spec.x * zoom}px;top:${-spec.y * zoom}px">`;
  return `<div class="crop" style="${style}">${spec.inset ? `<div class="inset" style="${spec.inset}">${image}</div>` : image}</div>`;
}

function card(index: string, name: string, line: string, body: string): string {
  return `<section><header><span class="mono muted">${index}</span><b class="mono">${name}</b><p>${line}</p></header>${body}</section>`;
}

function stripHtml(theme: Theme, raw: string): string {
  const dir = `${raw}/${theme}`;
  const albums: Crop = { src: `${dir}/strip-albums.png`, x: 214, y: 134, zoom: 1.65 };
  const queue: Crop = { src: `${dir}/strip-queue.png`, x: 940, y: 44, zoom: 2.1 };
  const popup: Crop = { src: `${dir}/strip-queue.png`, x: 852, y: 574, zoom: 1.7 };
  return `<!doctype html><meta charset="utf-8"><style>
${fontFace("Plex", "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2", "100 700")}
${fontFace("Mono", "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "100 800")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${STRIP.width}px;height:${STRIP.height}px;background:transparent;overflow:hidden}
body{position:relative;color:${FG[theme]};font-family:Plex,sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:Mono,monospace}.muted{color:${MUTED[theme]}}
section{position:absolute;top:0;width:${CARD_WIDTH}px;height:${STRIP.height}px;border:1px solid ${BORDER[theme]};background:${CARD[theme]};overflow:hidden}
section:nth-of-type(1){left:0}
section:nth-of-type(2){left:${STRIP.width - CARD_WIDTH}px}
header{height:${HEAD}px;padding:14px 22px 0;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px}
header span,header b{font-size:26px;font-weight:600;line-height:30px}
header span{font-weight:400}
header p{width:100%;font-size:24px;line-height:32px;color:${MUTED[theme]};white-space:nowrap}
.crop{position:absolute;overflow:hidden;border-top:1px solid ${BORDER[theme]};background:${BG[theme]}}
.crop img{position:absolute;max-width:none}
.pop{position:absolute;left:352px;top:388px;width:380px;height:162px;overflow:hidden;border:1px solid ${BORDER[theme]};box-shadow:0 24px 48px -12px rgba(0,0,0,${theme === "dark" ? 0.9 : 0.4})}
</style>
${card("01", "your library", "albums, artists, genres, filters.", crop(albums, inset(theme)))}
${card("02", "queue and devices", "a queue you can see, a device picker.", `${crop(queue, inset(theme))}<div class="pop">${crop(popup, "left:0;top:0;width:380px;height:162px;border:0")}</div>`)}
`;
}

async function toWebp(page: Page, png: Buffer, quality: number): Promise<Buffer> {
  const encoded = await page.evaluate(
    async ([data, q]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", Number(q)));
      const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0));
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    [png.toString("base64"), String(quality)] as const,
  );
  return Buffer.from(encoded, "base64");
}

export async function composeStrip(browser: Browser, raw: string, out: string, theme: Theme): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "lodesong-strip-"));
  const file = join(work, `features-${theme}.html`);
  writeFileSync(file, stripHtml(theme, raw));
  const page = await browser.newPage({ viewport: STRIP, deviceScaleFactor: 1 });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", omitBackground: true });
  await page.close();
  const encoder = await browser.newPage();
  const webp = await toWebp(encoder, png, 0.86);
  await encoder.close();
  if (webp.length < MIN_STRIP_BYTES || webp.length > MAX_STRIP_BYTES) throw new Error(`features-${theme}.webp is ${webp.length} bytes`);
  writeFileSync(`${out}/features-${theme}.webp`, webp);
  console.log(`${out}/features-${theme}.webp ${Math.round(webp.length / 1024)} KB`);
}

export async function composeHero(browser: Browser, raw: string, out: string, theme: Theme, frames: Frame[]): Promise<void> {
  const page = await browser.newPage();
  const pngs = frames.map((frame) => readFileSync(`${raw}/${theme}/${frame.name}.png`));
  const firstDiff = frames.findIndex((frame) => frame.name.startsWith("lyrics-")) + 1;
  const width = Math.round(HERO_VIEW.width * HERO_VIEW.scale);
  const height = Math.round(HERO_VIEW.height * HERO_VIEW.scale);
  const pieces = await regions(page, pngs, BORDER[theme], 0.8, firstDiff, [width, height]);
  await page.close();
  const webp = animate(
    width,
    height,
    pieces.map((piece, index) => ({ ...piece, ms: frames[index]?.hold ?? 1000, data: Buffer.from(piece.webp, "base64") })),
  );
  if (webp.length < MIN_BYTES || webp.length > MAX_BYTES) throw new Error(`hero-${theme}.webp is ${webp.length} bytes`);
  const decoded = await decodedFrames(browser, webp);
  const wrong =
    decoded.length !== frames.length ||
    decoded.some((frame, index) => frame.width !== width || frame.height !== height || frame.ms !== frames[index]?.hold);
  if (wrong) throw new Error(`hero-${theme}.webp does not decode to ${frames.length} frames of ${width}x${height}`);
  writeFileSync(`${out}/hero-${theme}.webp`, webp);
  console.log(`${out}/hero-${theme}.webp ${Math.round(webp.length / 1024)} KB, ${pieces.length} frames`);
}
