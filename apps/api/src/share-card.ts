import { clean } from "./card-text";
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

const valid = (id: string | undefined): id is string => !!id && ID.test(id);

function mosaic(entity: Entity): string[] {
  if (valid(entity.coverArt)) return [entity.coverArt];
  const covers = new Set((entity.entry ?? []).map((song) => song.coverArt).filter(valid));
  return [...covers].slice(0, 4);
}

export const LIMITS = { title: 120, subtitle: 160, stats: 80 } as const;
const cap = (text: string | undefined, max: number): string => clean(text ?? "", max);

function bounded(card: CardData): CardData {
  const subtitle = cap(card.subtitle, LIMITS.subtitle);
  return { ...card, title: cap(card.title, LIMITS.title), ...(subtitle ? { subtitle } : {}), stats: cap(card.stats, LIMITS.stats) };
}

export function cardOf(kind: ShareKind, entity: Entity): CardData | null {
  const card = rawCardOf(kind, entity);
  const kept = card && bounded(card);
  return kept?.title ? kept : null;
}

function rawCardOf(kind: ShareKind, entity: Entity): CardData | null {
  const title = (kind === "song" ? entity.title : entity.name)?.trim();
  if (!title) return null;
  const album = typeof entity.album === "string" ? entity.album : undefined;
  const base = { kind, title, covers: valid(entity.coverArt) ? [entity.coverArt] : [] };
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

/** Pixels to ask for each cover: a mosaic shows four small ones, otherwise one large. */
export const coverSize = (card: CardData): number => (card.covers.length > 1 ? 256 : 512);

export const GENERIC_TEXT = { title: "lodesong", description: "a self-hosted music player. sign in to open this link." };
