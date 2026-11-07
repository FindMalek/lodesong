import { createHash } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  await expect(page.getByRole("link", { name: "albums", exact: true }).or(page.getByRole("button", { name: "open menu" }))).toBeVisible({
    timeout: 15_000,
  });
}

export const test = base.extend<{ signedIn: Page }>({
  // Every test shares the mock's one play queue, so the queue hand-off stays off unless a test turns it on.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const key = "keep-player:settings";
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      const defaults = { queueSync: false, streamQuality: "original" };
      localStorage.setItem(key, JSON.stringify({ ...defaults, ...settings }));
      if (localStorage.getItem("keep-player:onboarded") === null) localStorage.setItem("keep-player:onboarded", "test");
    });
    // Playback rules and synced settings are per account, which every test shares: each test starts with none.
    await page.route("**/api/prefs**", (route) => route.fulfill({ json: { songs: [], albums: [] } }));
    await page.route("**/api/settings", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? { settings: null, updated: 0 } : { ok: true } }),
    );
    await use(page);
  },
  signedIn: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };

export const onPhone = (): boolean => base.info().project.name === "phone";

/** Headless Chromium never advances <audio> `currentTime`; this moves media time in real time while playing. */
export function fakeMediaClock(): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  if (!descriptor?.get || !descriptor.set) return;
  const { get, set } = descriptor;
  const clock = new WeakMap<HTMLMediaElement, { base: number; since: number | null; watched?: boolean }>();
  const state = (media: HTMLMediaElement) => {
    const value = clock.get(media) ?? { base: 0, since: null };
    clock.set(media, value);
    return value;
  };
  const now = (media: HTMLMediaElement) => {
    const value = state(media);
    return value.base + (value.since === null ? 0 : (performance.now() - value.since) / 1000);
  };
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return Math.max(get.call(this), now(this));
    },
    set(this: HTMLMediaElement, seconds: number) {
      const value = state(this);
      value.base = seconds;
      if (value.since !== null) value.since = performance.now();
      set.call(this, seconds);
    },
  });
  const play = HTMLMediaElement.prototype.play;
  const elements = new Set<HTMLMediaElement>();
  (window as unknown as { __playingMedia: () => number }).__playingMedia = () => [...elements].filter((media) => !media.paused).length;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    elements.add(this);
    const value = state(this);
    if (!value.watched) {
      value.watched = true;
      this.addEventListener("playing", () => Object.assign(state(this), { since: performance.now() }));
      this.addEventListener("pause", () => Object.assign(state(this), { base: now(this), since: null }));
    }
    return play.call(this);
  };
}

export async function trackTitles(page: Page): Promise<string[]> {
  const cells = page.locator("[aria-label=tracks] tbody tr td:nth-child(2) span:first-child");
  await expect(cells.first()).toBeVisible();
  return cells.allTextContents();
}

interface OutputProbe {
  level: () => number;
  states: () => string[];
}

/**
 * Taps everything wired to an AudioContext's speakers, so a spec can tell sound from silence: `outputLevel` is the
 * loudest recent RMS (0..1) and `outputStates` the state of every context. A page whose audio graph is broken (a
 * suspended context, a source that never reaches the output) is silent here even while the UI says "playing".
 */
export function tapOutput(): void {
  const contexts = new Set<BaseAudioContext>();
  const analysers = new Map<BaseAudioContext, AnalyserNode>();
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    contexts.add(this.context);
    if (args[0] === this.context.destination) {
      let analyser = analysers.get(this.context);
      if (!analyser) {
        analyser = this.context.createAnalyser();
        // Silent, but connected to the speakers so every engine keeps pulling it.
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(analyser, mute);
        connect.call(mute, this.context.destination);
        analysers.set(this.context, analyser);
      }
      connect.call(this, analyser);
    }
    return connect.apply(this, args);
  } as typeof AudioNode.prototype.connect;
  const probe: OutputProbe = {
    level: () => {
      let loudest = 0;
      for (const analyser of analysers.values()) {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        loudest = Math.max(loudest, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
      }
      return loudest;
    },
    states: () => [...contexts].map((context) => context.state),
  };
  (window as unknown as { __output: OutputProbe }).__output = probe;
}

export const outputLevel = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.level() ?? 0);

export const outputStates = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.states() ?? []);

/** Starts the stream quality (a setting the page reads at load) before the app runs. */
export async function useQuality(page: Page, quality: string): Promise<void> {
  await page.addInitScript((value) => {
    const key = "keep-player:settings";
    const settings = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...settings, streamQuality: value }));
  }, quality);
}

const MOCK = (): string => process.env.E2E_MOCK_URL as string;

/** The first song of a mock album, so a spec can break that one song's stream without touching the others. */
export async function firstSongOf(albumId: string): Promise<string> {
  const salt = "e2e";
  const token = createHash("md5").update(`demo${salt}`).digest("hex");
  const response = await fetch(`${MOCK()}/rest/getAlbum?u=demo&t=${token}&s=${salt}&v=1.16.1&c=e2e&f=json&id=${albumId}`);
  const body = (await response.json()) as { "subsonic-response": { album: { song: { id: string }[] } } };
  return (body["subsonic-response"].album.song[0] as { id: string }).id;
}

/** Breaks one song's stream in one format at the mock (`garbage` bytes or an `empty` body) until `off`. */
export async function breakStream(songId: string, format: "mp3" | "opus", mode: "garbage" | "empty" | "off" = "garbage"): Promise<void> {
  await fetch(`${MOCK()}/mock/fault?id=${songId}&format=${format}&mode=${mode}`, { method: "POST" });
}

/** A browser that can't play what it's sent: `canPlayType` answers "" for these types (an older Safari, Opus). */
export async function cannotPlay(page: Page, pattern: RegExp): Promise<void> {
  await page.addInitScript((source) => {
    const test = new RegExp(source);
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type: string) {
      return test.test(type) ? "" : original.call(this, type);
    };
  }, pattern.source);
}
