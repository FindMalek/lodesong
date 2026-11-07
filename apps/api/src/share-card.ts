import type { ShareKind } from "./share-token";

export interface CardData {
  kind: ShareKind;
  title: string;
  subtitle?: string;
  stats: string;
  /** Cover ids: one to fill the art, or up to four for a mosaic. */
  covers: string[];
}

export interface Entity {
  name?: string;
  title?: string;
  artist?: string;
  album?: unknown;
  songCount?: number;
  albumCount?: number;
  year?: number;
  duration?: number;
  coverArt?: string;
  entry?: { coverArt?: string }[];
}

export const ID = /^[\w.:-]{1,128}$/;

const plural = (count: number | undefined, noun: string): string | undefined =>
  count === undefined ? undefined : `${count} ${noun}${count === 1 ? "" : "s"}`;
const join = (...parts: (string | undefined | false)[]): string => parts.filter(Boolean).join(" · ");

export function hours(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

export function clock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function mosaic(entity: Entity): string[] {
  if (entity.coverArt) return [entity.coverArt];
  const covers = new Set((entity.entry ?? []).map((song) => song.coverArt).filter((id): id is string => !!id && ID.test(id)));
  return [...covers].slice(0, 4);
}

export function cardOf(kind: ShareKind, entity: Entity): CardData | null {
  const title = (kind === "song" ? entity.title : entity.name)?.trim();
  if (!title) return null;
  const album = typeof entity.album === "string" ? entity.album : undefined;
  const base = { kind, title, covers: entity.coverArt && ID.test(entity.coverArt) ? [entity.coverArt] : [] };
  const length = entity.duration ? hours(entity.duration) : undefined;
  switch (kind) {
    case "album":
      return {
        ...base,
        subtitle: join(entity.artist, entity.year ? String(entity.year) : undefined),
        stats: join(plural(entity.songCount, "song"), length),
      };
    case "artist": {
      const albums = Array.isArray(entity.album) ? (entity.album as { songCount?: number }[]) : undefined;
      const songs = albums?.reduce((sum, item) => sum + (item.songCount ?? 0), 0);
      return { ...base, stats: join(plural(entity.albumCount ?? albums?.length, "album"), songs ? plural(songs, "song") : undefined) };
    }
    case "playlist":
      return { ...base, covers: mosaic(entity), stats: join(plural(entity.songCount, "song"), length) };
    case "song":
      return {
        ...base,
        subtitle: join(entity.artist, album),
        stats: join(entity.duration ? clock(entity.duration) : undefined, entity.year ? String(entity.year) : undefined),
      };
  }
}

export function textOf(card: CardData): { title: string; description: string } {
  return { title: card.title, description: join(card.kind, card.subtitle, card.stats) };
}

export const GENERIC_TEXT = { title: "lodesong", description: "a self-hosted music player. sign in to open this link." };

const COVERED: [number, number][] = [
  [0x20, 0x7e],
  [0xa0, 0x17f],
  [0x218, 0x21b],
  [0x2b0, 0x2ff],
  [0x370, 0x3ff],
  [0x400, 0x45f],
  [0x1e00, 0x1eff],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
];

/** The bundled fonts are latin, greek and cyrillic. Anything else (CJK, emoji) would draw as empty boxes, so it is dropped. */
export function printable(text: string): string {
  const kept = [...text].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return COVERED.some(([from, to]) => code >= from && code <= to);
  });
  return kept.join("").replace(/\s+/g, " ").trim();
}
