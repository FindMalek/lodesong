import { describe, expect, test } from "bun:test";
import { clock, fileFormat, syncAge } from "./format";

test("clock pads seconds and switches to hours past 60 minutes", () => {
  expect(clock(65)).toBe("1:05");
  expect(clock(3725)).toBe("1:02:05");
});

describe("fileFormat", () => {
  test("lists codec, depth, rate and bit rate that are known", () => {
    expect(fileFormat({ suffix: "flac", bitDepth: 24, samplingRate: 96000, bitRate: 2822 })).toBe("FLAC · 24-bit · 96 kHz · 2822 kbps");
    expect(fileFormat({ suffix: "mp3", samplingRate: 44100, bitRate: 320 })).toBe("MP3 · 44.1 kHz · 320 kbps");
    expect(fileFormat({})).toBe("");
  });
});

test("syncAge flags a sync that missed its daily run", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  expect(syncAge("2026-11-22T05:17:00Z", now)).toEqual({ text: "last synced 6 hours ago", stale: false });
  expect(syncAge("2026-11-19T05:17:00Z", now)).toEqual({ text: "last synced 3 days ago", stale: true });
  expect(syncAge(null, now).stale).toBe(true);
});
