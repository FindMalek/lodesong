import { expect, test } from "bun:test";
import { finite, markPlaybackSession, silencesUnsized } from "./decks";

test("only WebKit engines get the whole-download fallback for streams without a length", () => {
  const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  const app = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) lodesong-desktop";
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const firefox = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0";
  expect([safari, app, chrome, firefox].map(silencesUnsized)).toEqual([true, true, false, false]);
});

test("a gain that is not a number plays at unity instead of throwing in the audio graph", () => {
  expect([Number.NaN, Number.POSITIVE_INFINITY, 0.5, 0].map((gain) => finite(gain))).toEqual([1, 1, 0.5, 0]);
});

test("the audio session is marked playback where the browser has one", () => {
  const nav = { audioSession: { type: "auto" } };
  markPlaybackSession(nav);
  expect(nav.audioSession.type).toBe("playback");
});

test("browsers without an audio session, or with a read-only one, are left alone", () => {
  expect(() => markPlaybackSession({})).not.toThrow();
  const frozen = Object.defineProperty({ audioSession: {} as { type: string } }, "audioSession", { value: {} });
  Object.defineProperty(frozen.audioSession, "type", {
    get: () => "auto",
    set: () => {
      throw new Error("read-only");
    },
  });
  expect(() => markPlaybackSession(frozen)).not.toThrow();
});
