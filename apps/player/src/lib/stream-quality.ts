export const QUALITIES = [
  ["auto", "auto"],
  ["original", "original"],
  ["mp3-320", "mp3 320"],
  ["opus-192", "opus 192"],
  ["opus-96", "opus 96"],
] as const;
export type StreamQuality = (typeof QUALITIES)[number][0];
export type Playing = Exclude<StreamQuality, "auto">;

/** What the browser plays when it can't play a song's own format: widely supported and still good. */
export const FALLBACK: Playing = "mp3-320";

export function isStreamQuality(value: unknown): value is StreamQuality {
  return QUALITIES.some(([name]) => name === value);
}

/** Auto: songs kept on this device play as they are (they come from the offline cache), the rest as a light transcode. */
export function resolveQuality(setting: StreamQuality, kept: boolean, opusOk: boolean): Playing {
  if (setting !== "auto") return setting;
  if (kept) return "original";
  return opusOk ? "opus-192" : FALLBACK;
}

export function streamParams(quality: Playing): Record<string, string> {
  if (quality === "original") return { format: "raw" };
  const [format, bitRate] = quality.split("-") as [string, string];
  // The estimate gives the browser a length to seek in; Navidrome can't know a transcode's size up front.
  return { format, maxBitRate: bitRate, estimateContentLength: "true" };
}
