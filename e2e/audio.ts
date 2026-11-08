import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Page } from "@playwright/test";

interface OutputProbe {
  level: () => number;
  states: () => string[];
  silencedElement: () => boolean;
  sinkCalls: () => string[];
}

const TAP = join(process.cwd(), "test/output-tap.js");

interface Tap {
  /** "none": render to no device (no sound card in CI). "spy": the real `setSinkId`, recorded. */
  sink?: "none" | "spy";
  gate?: boolean;
}

export async function tapOutput(page: Page, options: Tap = {}): Promise<void> {
  const tap: Tap = { sink: "none", ...options };
  await page.addInitScript((value) => ((window as unknown as { __tap: Tap }).__tap = value), tap);
  await page.addInitScript({ path: TAP });
}

export async function nativeBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const keep = { postMessage: () => undefined };
    Object.defineProperty(window, "webkit", { value: { messageHandlers: { keep } }, configurable: true });
  });
}

export const keepNative = (page: Page, command: "play" | "toggle"): Promise<void> =>
  page.evaluate((name) => (window as unknown as { keepNative: Record<string, () => void> }).keepNative[name]?.(), command);

export const outputLevel = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.level() ?? 0);

export const silencedElement = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.silencedElement() ?? false);

export const sinkCalls = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.sinkCalls() ?? []);

export const outputStates = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.states() ?? []);

export async function useQuality(page: Page, quality: string): Promise<void> {
  await page.addInitScript((value) => {
    const key = "keep-player:settings";
    const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...settings, streamQuality: value }));
  }, quality);
}

const MOCK = (): string => process.env.E2E_MOCK_URL as string;

export async function firstSongOf(albumId: string): Promise<string> {
  const salt = "e2e";
  const token = createHash("md5").update(`demo${salt}`).digest("hex");
  const response = await fetch(`${MOCK()}/rest/getAlbum?u=demo&t=${token}&s=${salt}&v=1.16.1&c=e2e&f=json&id=${albumId}`);
  const body = (await response.json()) as { "subsonic-response": { album: { song: { id: string }[] } } };
  return (body["subsonic-response"].album.song[0] as { id: string }).id;
}

export async function breakStream(songId: string, format: "mp3" | "opus", mode: "garbage" | "empty" | "off" = "garbage"): Promise<void> {
  await fetch(`${MOCK()}/mock/fault?id=${songId}&format=${format}&mode=${mode}`, { method: "POST" });
}

/** A browser that can't play these types: `canPlayType` answers "". */
export async function cannotPlay(page: Page, pattern: RegExp): Promise<void> {
  await page.addInitScript((source) => {
    const test = new RegExp(source);
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return test.test(type) ? "" : original.call(this, type);
    };
  }, pattern.source);
}
