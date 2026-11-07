import plexCyrillic400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-400-normal.woff" with { type: "file" };
import plexCyrillic600 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-600-normal.woff" with { type: "file" };
import plexGreek400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-greek-400-normal.woff" with { type: "file" };
import plexGreek600 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-greek-600-normal.woff" with { type: "file" };
import plexLatin400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff" with { type: "file" };
import plexLatin600 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff" with { type: "file" };
import plexLatinExt400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-normal.woff" with { type: "file" };
import plexLatinExt600 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff" with { type: "file" };
import monoLatin500 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff" with { type: "file" };
import monoLatinExt500 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff" with { type: "file" };

export interface CardFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600;
  style: "normal";
}

const FILES: [string, 400 | 500 | 600, string][] = [
  ["Plex", 400, plexLatin400],
  ["PlexExt", 400, plexLatinExt400],
  ["PlexGreek", 400, plexGreek400],
  ["PlexCyrillic", 400, plexCyrillic400],
  ["Plex", 600, plexLatin600],
  ["PlexExt", 600, plexLatinExt600],
  ["PlexGreek", 600, plexGreek600],
  ["PlexCyrillic", 600, plexCyrillic600],
  ["Mono", 500, monoLatin500],
  ["MonoExt", 500, monoLatinExt500],
];

/** One family per file, listed in order: satori falls back along the list glyph by glyph. */
export const SANS = "Plex, PlexExt, PlexGreek, PlexCyrillic";
export const MONO = "Mono, MonoExt";

let loaded: Promise<CardFont[]> | undefined;

/** The OFL fonts the app uses, embedded in the executable. */
export function cardFonts(): Promise<CardFont[]> {
  loaded ??= Promise.all(
    FILES.map(async ([name, weight, path]) => ({ name, weight, style: "normal" as const, data: await Bun.file(path).arrayBuffer() })),
  );
  return loaded;
}
