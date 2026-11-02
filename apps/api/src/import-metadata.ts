import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseFile } from "music-metadata";
import { type GroqConfig, groqJson } from "./groq";

export const FIELDS = ["title", "artist", "album", "year", "genre", "track"] as const;
type Field = (typeof FIELDS)[number];
export type Tags = Partial<Record<Field, string>>;

export interface Suggestion {
  field: Field;
  current: string;
  proposed: string;
  /** "fill" has nothing to lose; "replace" would change a tag the file already has. */
  kind: "fill" | "replace";
}

const AUDIO = new Set([".flac", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".aiff", ".alac", ".wv"]);

export const isAudio = (path: string): boolean => AUDIO.has(extname(path).toLowerCase());

export async function readTags(path: string): Promise<Tags> {
  if (!(await stat(path).catch(() => null))?.isFile()) return {};
  const common = (await parseFile(path, { duration: false, skipCovers: true }).catch(() => null))?.common;
  const tags: Tags = {
    title: common?.title,
    artist: common?.artist,
    album: common?.album,
    year: common?.year ? String(common.year) : undefined,
    genre: common?.genre?.join(", "),
    track: common?.track.no ? String(common.track.no) : undefined,
  };
  return Object.fromEntries(Object.entries(tags).filter(([, value]) => value?.trim())) as Tags;
}

const SYSTEM = `You fix music file tags. You get the folder and file name an upload came in with and the tags already in the file.
Answer with JSON only: {"title": string, "artist": string, "album": string, "year": string, "genre": string, "track": string}.
Include a field only when it is missing from the tags, or the tag is clearly garbled (mojibake, a file name or url pasted in, "Unknown", "Track 01", all caps junk) and you are confident of the right value from the file name, the folder or what you know about the song. Leave out every field you are unsure about, and every tag that is already fine. Never invent a year or an album.`;

export function parseSuggestions(text: string, current: Tags): Suggestion[] {
  let value: unknown;
  try {
    value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const raw = (value ?? {}) as Record<string, unknown>;
  const suggestions: Suggestion[] = [];
  for (const field of FIELDS) {
    const answer = raw[field];
    const proposed = typeof answer === "string" || typeof answer === "number" ? String(answer).trim().slice(0, 200) : "";
    const now = current[field] ?? "";
    if (!proposed || proposed === now) continue;
    if (field === "year" && !/^(1[89]|20)\d\d$/.test(proposed)) continue;
    if (field === "track" && !/^\d{1,3}$/.test(proposed)) continue;
    suggestions.push({ field, current: now, proposed, kind: now ? "replace" : "fill" });
  }
  return suggestions;
}

export async function suggestTags(
  config: GroqConfig,
  relative: string,
  current: Tags,
  fetcher: typeof fetch = fetch,
): Promise<Suggestion[] | null> {
  const folders = relative.split("/").slice(0, -1).join("/");
  const text = await groqJson(
    config,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Folder: ${folders || "(none)"}\nFile: ${basename(relative)}\nTags: ${JSON.stringify(current)}` },
    ],
    { temperature: 0.1, maxTokens: 400 },
    fetcher,
  );
  return text === null ? null : parseSuggestions(text, current);
}

/** What the person accepted goes next to the file; the audio file itself is never touched. */
export async function writeSidecar(path: string, original: Tags, accepted: Tags): Promise<void> {
  await Bun.write(`${path}.lodesong.json`, `${JSON.stringify({ file: basename(path), original, accepted, source: "groq" }, null, 2)}\n`);
}
