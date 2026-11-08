import { colourCover } from "./cover";
import { albumName, artistName, idNumber, lyricLine, releaseYear, songTitle } from "./names";

type Node = Record<string, unknown>;

const covers = new Map<string, Uint8Array<ArrayBuffer>>();

function coverFor(id: string, size: number): Uint8Array<ArrayBuffer> {
  const key = `${id}:${size}`;
  const hit = covers.get(key);
  if (hit) return hit;
  const made = colourCover(idNumber(id) + (id.startsWith("ar-") ? 3 : 0), size);
  covers.set(key, made);
  return made;
}

function rename(node: Node): void {
  const id = typeof node.id === "string" ? node.id : "";
  if (id.startsWith("ar-")) node.name = artistName(id);
  if (id.startsWith("al-")) Object.assign(node, { name: albumName(id), year: releaseYear(id) });
  if (id.startsWith("so-")) Object.assign(node, { title: songTitle(id), year: releaseYear(String(node.albumId ?? id)) });
  if (typeof node.artistId === "string") node.artist = artistName(node.artistId);
  if (typeof node.albumId === "string") node.album = albumName(node.albumId);
  if (typeof node.albumArtist === "string" && typeof node.artistId === "string") node.albumArtist = artistName(node.artistId);
  if (Array.isArray(node.line)) {
    const seed = idNumber(String(node.line.length)) + 2;
    node.line = node.line.map((line: Node, index: number) => ({ ...line, value: lyricLine(seed, index) }));
  }
}

function walk(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (value && typeof value === "object") {
    rename(value as Node);
    Object.values(value).forEach(walk);
  }
}

function lrc(text: string): string {
  return text.replace(/\](.*) from lrclib (\d+)/g, (_match, _title, index) => `]${lyricLine(5, Number(index))}`);
}

export function startFixture(port: number, upstream: string): { stop: () => void } {
  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/rest/getCoverArt")) {
        const size = Math.min(Math.max(Number(url.searchParams.get("size") ?? 300), 16), 512);
        return new Response(coverFor(url.searchParams.get("id") ?? "", size), { headers: { "content-type": "image/png" } });
      }
      const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("json") && !url.pathname.startsWith("/lrclib/")) return response;
      const text = await response.text();
      if (url.pathname.startsWith("/lrclib/"))
        return new Response(lrc(text), { status: response.status, headers: { "content-type": type } });
      const body = JSON.parse(text);
      walk(body);
      return Response.json(body, { status: response.status });
    },
  });
  return { stop: () => server.stop(true) };
}
