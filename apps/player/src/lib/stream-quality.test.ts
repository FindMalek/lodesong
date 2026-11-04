import { describe, expect, test } from "bun:test";
import { FALLBACK, isStreamQuality, QUALITIES, resolveQuality, streamParams } from "./stream-quality";

describe("stream quality", () => {
  test("original asks for the raw file", () => {
    expect(streamParams("original")).toEqual({ format: "raw" });
  });
  test("a transcode asks for a format and bit rate, with a length estimate for seeking", () => {
    expect(streamParams("opus-192")).toEqual({ format: "opus", maxBitRate: "192", estimateContentLength: "true" });
    expect(streamParams("mp3-320")).toEqual({ format: "mp3", maxBitRate: "320", estimateContentLength: "true" });
  });
  test("every listed quality is valid, the fallback among them, and junk is not", () => {
    for (const [name] of QUALITIES) expect(isStreamQuality(name)).toBe(true);
    expect(isStreamQuality(FALLBACK)).toBe(true);
    expect(isStreamQuality("flac-9000")).toBe(false);
    expect(isStreamQuality(undefined)).toBe(false);
  });
  test("auto keeps kept songs original and streams the rest light; a fixed choice is never overridden", () => {
    expect(resolveQuality("auto", true)).toBe("original");
    expect(resolveQuality("auto", false)).toBe("opus-192");
    expect(resolveQuality("opus-96", true)).toBe("opus-96");
    expect(resolveQuality("original", false)).toBe("original");
  });
});
