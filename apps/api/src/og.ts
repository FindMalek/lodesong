import { deflateSync } from "node:zlib";
import type { Upstream } from "./config";
import type { Session } from "./sessions";
import { subsonic } from "./subsonic";

export type ShareKind = "album" | "artist" | "playlist" | "song";

interface Card {
  title: string;
  description: string;
  cover?: string;
}

interface Entity {
  name?: string;
  title?: string;
  artist?: string;
  album?: unknown;
  songCount?: number;
  albumCount?: number;
  year?: number;
  coverArt?: string;
}

const GENERIC: Card = { title: "lodesong", description: "a self-hosted music player. sign in to open this link." };
const ID = /^[\w.:-]{1,128}$/;
const ENDPOINT = { album: "getAlbum", artist: "getArtist", playlist: "getPlaylist", song: "getSong" } as const;
// The page waits on this lookup, so a slow Navidrome must not hold up the app.
const LOOKUP_MS = 2000;
const WIDTH = 1200;
const HEIGHT = 630;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const plural = (count: number | undefined, noun: string): string =>
  count === undefined ? "" : `${count} ${noun}${count === 1 ? "" : "s"}`;
const join = (...parts: (string | undefined)[]): string => parts.filter(Boolean).join(" · ");

function describe(kind: ShareKind, entity: Entity): Card | null {
  const title = (kind === "song" ? entity.title : entity.name)?.trim();
  if (!title) return null;
  const description = {
    album: join("album", entity.artist, entity.year ? String(entity.year) : undefined, plural(entity.songCount, "song")),
    artist: join("artist", plural(entity.albumCount, "album")),
    playlist: join("playlist", plural(entity.songCount, "song")),
    song: join("song", entity.artist, typeof entity.album === "string" ? entity.album : undefined),
  }[kind];
  return { title, description, cover: entity.coverArt };
}

/** The real name and cover, asked as the signed-in user. Anyone else gets the generic card: nothing here is public. */
async function lookup(kind: ShareKind, id: string, upstream: Upstream, session: Session): Promise<Card | null> {
  if (!ID.test(id)) return null;
  const asked = subsonic<Partial<Record<ShareKind, Entity>>>(upstream, session, ENDPOINT[kind], { id });
  const result = await Promise.race([asked, Bun.sleep(LOOKUP_MS).then(() => null)]);
  const entity = result?.[kind];
  return entity ? describe(kind, entity) : null;
}

function origin(request: Request): string {
  const url = new URL(request.url);
  return request.headers.get("x-forwarded-proto") === "https" ? `https://${url.host}` : url.origin;
}

function tags(card: Card, request: Request): string {
  const base = origin(request);
  const cover = card.cover && ID.test(card.cover) ? card.cover : null;
  const image = cover ? `${base}/cover/${encodeURIComponent(cover)}/600` : `${base}/og.png`;
  const meta: [string, string][] = [
    ["og:site_name", "lodesong"],
    ["og:type", "website"],
    ["og:title", card.title],
    ["og:description", card.description],
    ["og:url", base + new URL(request.url).pathname],
    ["og:image", image],
  ];
  const twitter: [string, string][] = [
    ["twitter:card", cover ? "summary" : "summary_large_image"],
    ["twitter:title", card.title],
    ["twitter:description", card.description],
    ["twitter:image", image],
  ];
  const line = (attribute: string) => (pair: [string, string]) => `<meta ${attribute}="${pair[0]}" content="${escapeHtml(pair[1])}" />`;
  return [...meta.map(line("property")), ...twitter.map(line("name"))].join("\n    ");
}

/** The `<head>` tags for a shared link. Without a session (a crawler) they say nothing about the library. */
export async function shareTags(
  request: Request,
  kind: ShareKind,
  id: string,
  access: { session: Session; upstream: Upstream } | null,
): Promise<string> {
  const found = access ? await lookup(kind, id, access.upstream, access.session) : null;
  return tags(found ?? GENERIC, request);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(Bun.hash.crc32(body), body.length + 4);
  return out;
}

function drawCard(): Uint8Array {
  const scale = HEIGHT / 16;
  const left = (WIDTH - HEIGHT) / 2;
  const stride = WIDTH * 3 + 1;
  const rows = new Uint8Array(HEIGHT * stride);
  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / scale;
    const right = v <= 8 ? 5 + (v - 3.5) * (7 / 4.5) : 12 - (v - 8) * (7 / 4.5);
    for (let x = 0; x < WIDTH; x += 1) {
      const u = (x - left) / scale;
      const shade = v >= 3.5 && v <= 12.5 && u >= 5 && u <= right ? 0xeb : 0x10;
      rows.fill(shade, y * stride + 1 + x * 3, y * stride + 4 + x * 3);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, WIDTH);
  view.setUint32(4, HEIGHT);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", new Uint8Array()),
  ]);
}

let card: Uint8Array | undefined;

export function cardImage(): Response {
  card ??= drawCard();
  return new Response(card as Uint8Array<ArrayBuffer>, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
