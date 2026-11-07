import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

interface OutputProbe {
  level: () => number;
  states: () => string[];
  silencedElement: () => boolean;
}

/** Taps what is wired to a context's speakers: `outputLevel` is the loudest recent RMS, `outputStates` every context's state. */
export function tapOutput(): void {
  // No sound card in CI: render to no device (Chrome), and keep the app from switching back to the default one.
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(options?: AudioContextOptions) {
      super({ ...options, sinkId: { type: "none" } } as AudioContextOptions);
    }
    setSinkId = async (): Promise<void> => undefined;
  };
  const contexts = new Set<BaseAudioContext>();
  const elements = new Set<HTMLMediaElement>();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    elements.add(this);
    return play.call(this);
  };
  const analysers = new Map<BaseAudioContext, AnalyserNode>();
  const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
    contexts.add(this.context);
    if (args[0] === this.context.destination) {
      let analyser = analysers.get(this.context);
      if (!analyser) {
        analyser = this.context.createAnalyser();
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
  const disconnect = AudioNode.prototype.disconnect as (this: AudioNode, ...args: unknown[]) => unknown;
  AudioNode.prototype.disconnect = function (this: AudioNode, ...args: unknown[]) {
    const analyser = analysers.get(this.context);
    if (analyser && (args.length === 0 || args[0] === this.context.destination)) {
      try {
        disconnect.call(this, analyser);
      } catch {}
    }
    return disconnect.apply(this, args);
  } as typeof AudioNode.prototype.disconnect;
  const probe: OutputProbe = {
    silencedElement: () => [...elements].some((element) => !element.paused && (element.muted || element.volume < 1)),
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

export const silencedElement = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __output: OutputProbe }).__output?.silencedElement() ?? false);

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
