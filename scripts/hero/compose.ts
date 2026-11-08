import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { ditherCells, ditherPath, ditherSeed } from "../../packages/shared/src/dither";

type Theme = "dark" | "light";

const TOKENS: Record<Theme, Record<string, string>> = {
  dark: {
    bg: "#101010",
    fg: "#ebebeb",
    muted: "#939393",
    border: "#262626",
    card: "#191919",
    bar: "#161616",
    ink: "rgba(255,255,255,0.16)",
  },
  light: { bg: "#ebebeb", fg: "#101010", muted: "#5a5a5a", border: "#c5c5c5", card: "#f5f5f5", bar: "#e2e2e2", ink: "rgba(0,0,0,0.14)" },
};

const MARK = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";
const CHIPS = ["synced lyrics", "daily mixes", "a queue you can see", "one session, every device"];
const HERO = { width: 1280, height: 960 };
const STRIP = { width: 1280, height: 720 };

function fontFace(family: string, spec: string, weights: string): string {
  const path = Bun.resolveSync(spec, `${process.cwd()}/apps/api`);
  return `@font-face{font-family:"${family}";src:url("file://${path}") format("woff2");font-weight:${weights}}`;
}

function base(theme: Theme, size: { width: number; height: number }): string {
  const t = TOKENS[theme];
  return `<!doctype html><meta charset="utf-8"><style>
${fontFace("Plex", "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2", "100 700")}
${fontFace("Mono", "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "100 800")}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${size.width}px;height:${size.height}px;background:${t.bg};color:${t.fg};font-family:Plex,sans-serif;position:relative;overflow:hidden;-webkit-font-smoothing:antialiased}
.mono{font-family:Mono,monospace}
.muted{color:${t.muted}}
</style>`;
}

function dither(theme: Theme, width: number, height: number, cell: number, mask: string): string {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const path = ditherPath(ditherCells(cols, rows, ditherSeed("lodesong"), 0), cols, cell);
  return `<svg style="position:absolute;inset:0;mask-image:${mask};-webkit-mask-image:${mask}" width="${width}" height="${height}"><path d="${path}" fill="${TOKENS[theme].ink}"/></svg>`;
}

function heroHtml(theme: Theme, raw: string): string {
  const t = TOKENS[theme];
  const dark = theme === "dark";
  const shadow = dark ? "0 60px 120px -20px #000, 0 0 0 1px #262626" : "0 50px 100px -30px rgba(0,0,0,.35), 0 0 0 1px #c5c5c5";
  const glow = dark
    ? "radial-gradient(520px 420px at 86% 38%, rgba(232,89,12,.20), transparent 70%), radial-gradient(640px 420px at 26% 100%, rgba(59,91,219,.16), transparent 70%)"
    : "radial-gradient(520px 420px at 86% 38%, rgba(232,89,12,.16), transparent 70%), radial-gradient(640px 420px at 26% 100%, rgba(59,91,219,.12), transparent 70%)";
  return `${base(theme, HERO)}<style>
body{background:${glow},${t.bg}}
.brand{position:absolute;left:72px;top:44px;display:flex;align-items:center;gap:11px;font:500 16px Mono}
.brand svg{width:18px;height:18px;fill:${t.fg}}
h1{position:absolute;left:72px;top:84px;font-size:58px;line-height:1.04;letter-spacing:-.04em;font-weight:600}
p.sub{position:absolute;left:72px;top:224px;font-size:18px;color:${t.muted}}
.chips{position:absolute;left:72px;top:268px;display:flex;gap:8px}
.chip{border:1px solid ${t.border};background:${t.card};padding:6px 10px;font:500 12px Mono;color:${t.fg}}
.win{position:absolute;left:72px;top:334px;width:1100px;background:${t.bg};box-shadow:${shadow}}
.win .bar{height:36px;background:${t.bar};border-bottom:1px solid ${t.border};display:flex;align-items:center;padding:0 14px;position:relative}
.dots{display:flex;gap:7px}.dots i{width:10px;height:10px;border:1px solid ${dark ? "#3a3a3a" : "#a8a8a8"}}
.url{position:absolute;left:50%;transform:translateX(-50%);width:300px;height:22px;border:1px solid ${t.border};background:${t.bg};font:400 11px/20px Mono;text-align:center;color:${t.muted}}
.win img{display:block;width:1100px}
.phone{position:absolute;left:952px;top:240px;width:272px;padding:8px;background:${dark ? "#0a0a0a" : "#1b1b1b"};border:1px solid ${dark ? "#333" : "#000"};border-radius:36px;box-shadow:${dark ? "0 50px 90px -10px #000, 0 0 0 1px #1c1c1c" : "0 50px 90px -20px rgba(0,0,0,.5)"}}
.phone .screen{position:relative;border-radius:29px;overflow:hidden;background:${t.bg}}
.phone img{display:block;width:100%}
.phone .pill{position:absolute;left:50%;top:9px;width:74px;height:21px;margin-left:-37px;border-radius:11px;background:#000}
.fade{position:absolute;left:0;right:0;bottom:0;height:90px;background:linear-gradient(to bottom,transparent,${t.bg})}
</style>
${dither(theme, HERO.width, 340, 8, "radial-gradient(ellipse 50% 95% at 90% 0%, #000 0%, transparent 72%)")}
<div class="brand"><svg viewBox="8 8 48 48"><path d="${MARK}"/></svg>lodesong</div>
<h1>your own music,<br><span class="muted">played like a streaming app.</span></h1>
<p class="sub">a monochrome web player for your Navidrome library.</p>
<div class="chips">${CHIPS.map((chip) => `<span class="chip">${chip}</span>`).join("")}</div>
<div class="win"><div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">music.example.com</div></div><img src="file://${raw}/desk-scrolled.png"></div>
<div class="phone"><div class="screen"><img src="file://${raw}/phone-home.png"><div class="pill"></div></div></div>
<div class="fade"></div>`;
}

function crop(src: string, scale: number, x: number, y: number, w: number, h: number, extra = ""): string {
  return `<div class="crop" style="width:${w}px;height:${h}px;${extra}"><img src="${src}" style="width:${1440 * scale}px;left:${-x * scale}px;top:${-y * scale}px"></div>`;
}

function stripHtml(theme: Theme, raw: string): string {
  const t = TOKENS[theme];
  const dark = theme === "dark";
  const card = (cls: string, index: string, name: string, line: string, body: string): string =>
    `<section class="${cls}"><header><div><span class="mono muted" style="margin-right:10px">${index}</span><span class="mono name">${name}</span></div><p>${line}</p></header>${body}</section>`;
  const lyrics = crop(`file://${raw}/desk-full.png`, 0.58, 20, -20, 644, 548);
  const mixes = crop(`file://${raw}/desk-home.png`, 0.85, 215, 245, 516, 214);
  const queue = `<div class="pair">
    ${crop(`file://${raw}/desk-queue.png`, 0.9, 1120, 44, 288, 214)}
    <div class="pop">${crop(`file://${raw}/desk-queue.png`, 0.9, 1012, 752, 204, 88)}</div></div>`;
  return `${base(theme, STRIP)}<style>
.grid{position:absolute;left:48px;top:48px;width:1184px;height:624px;display:grid;grid-template-columns:644px 516px;grid-template-rows:300px 300px;gap:24px}
section{border:1px solid ${t.border};background:${t.card};overflow:hidden;display:flex;flex-direction:column;box-shadow:${dark ? "0 30px 60px -30px #000" : "0 30px 60px -36px rgba(0,0,0,.3)"}}
section.big{grid-row:1 / span 2}
header{padding:18px 20px 16px;height:78px}
header div{font-size:14px;margin-bottom:6px}
.name{font-weight:600;color:${t.fg}}
header p{font-size:14px;color:${t.muted};white-space:nowrap}
.crop{position:relative;overflow:hidden;border-top:1px solid ${t.border};background:${t.bg}}
.crop img{position:absolute;max-width:none}
.pair{position:relative;flex:1;border-top:1px solid ${t.border};background:${t.bg}}
.pair .crop{border-top:0;border-right:1px solid ${t.border}}
.pop{position:absolute;left:300px;top:58px;box-shadow:0 18px 40px -8px rgba(0,0,0,${dark ? 0.85 : 0.35})}
.pop .crop{border:1px solid ${t.border}}
</style>
<div class="grid">
${card("big", "01", "synced lyrics", "line by line, full screen with ⇧F, timing nudged per song.", lyrics)}
${card("", "02", "made for you", "daily mixes and discover weekly, from what you play.", mixes)}
${card("", "03", "queue and devices", "a queue you can see, and a picker for every signed-in device.", queue)}
</div>`;
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

export async function compose(browser: Browser, raw: string, out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "lodesong-compose-"));
  const jobs: [string, (theme: Theme, dir: string) => string, { width: number; height: number }, number][] = [
    ["hero", heroHtml, HERO, 0.82],
    ["features", stripHtml, STRIP, 0.86],
  ];
  const encoder = await browser.newPage();
  for (const theme of ["dark", "light"] as const) {
    for (const [name, html, size, quality] of jobs) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1.5 });
      const file = join(work, `${name}-${theme}.html`);
      writeFileSync(file, html(theme, `${raw}/${theme}`));
      await page.goto(`file://${file}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const png = await page.screenshot({ type: "png" });
      await page.close();
      const webp = await toWebp(encoder, png, quality);
      writeFileSync(`${out}/${name}-${theme}.webp`, webp);
      console.log(`${out}/${name}-${theme}.webp ${Math.round(webp.length / 1024)} KB`);
    }
  }
  await encoder.close();
}
