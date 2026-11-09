type Line = { start: number; value: string };

const WORD_SHARE = 0.85;
const LINE_MS = 5000;

function stamp(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = String(Math.floor(total / 60_000)).padStart(2, "0");
  const seconds = String(Math.floor((total % 60_000) / 1000)).padStart(2, "0");
  const hundredths = String(Math.floor((total % 1000) / 10)).padStart(2, "0");
  return `${minutes}:${seconds}.${hundredths}`;
}

/** Enhanced LRC: every word carries its own stamp, spread over the first part of the line. */
export function enhanced(lines: Line[]): string {
  return lines
    .map((line, index) => {
      const span = ((lines[index + 1]?.start ?? line.start + LINE_MS) - line.start) * WORD_SHARE;
      const words = line.value.split(" ");
      const body = words.map((word, at) => `<${stamp(line.start + Math.round((at / words.length) * span))}>${word}`).join(" ");
      return `[${stamp(line.start)}]${body}`;
    })
    .join("\n");
}

const key = (title: string, album: string, duration: number): string => `${title}|${album}|${Math.round(duration)}`;

/**
 * Sits between the app and the hero fixture. Navidrome's lyrics carry no word timings, so every synced song is
 * handed to the app through LRCLIB instead, as Enhanced LRC built from the very same lines.
 */
export function startWords(port: number, upstream: string): { stop: () => void } {
  const songs = new Map<string, string>();
  let auth = "";
  const lyricsOf = async (id: string): Promise<Line[]> => {
    const body = await (await fetch(`${upstream}/rest/getLyricsBySongId?id=${id}&f=json&${auth}`)).json();
    return body["subsonic-response"].lyricsList?.structuredLyrics?.find((item: { synced: boolean }) => item.synced)?.line ?? [];
  };
  const server = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const { u, t, s } = Object.fromEntries(url.searchParams);
      if (u && t && s) auth = new URLSearchParams({ u, t, s }).toString();
      if (url.pathname === "/lrclib/api/get") {
        const params = url.searchParams;
        const id = songs.get(key(params.get("track_name") ?? "", params.get("album_name") ?? "", Number(params.get("duration") ?? 0)));
        const lines = id ? await lyricsOf(id) : [];
        if (!id || !lines.length) return new Response("not found", { status: 404 });
        return Response.json({
          id: Number(id.replace(/\D/g, "")),
          trackName: params.get("track_name"),
          artistName: params.get("artist_name"),
          duration: Number(params.get("duration")),
          instrumental: false,
          plainLyrics: null,
          syncedLyrics: enhanced(lines),
        });
      }
      const response = await fetch(`${upstream}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      if (url.pathname === "/rest/getSong") {
        const text = await response.text();
        const song = JSON.parse(text)["subsonic-response"]?.song;
        if (song) songs.set(key(song.title, song.album ?? "", song.duration ?? 0), song.id);
        return new Response(text, { status: response.status, headers: response.headers });
      }
      // The server's own lookups put the credentials first (`?u=`); a browser's passthrough puts them last.
      if (url.pathname === "/rest/getLyricsBySongId" && url.search.startsWith("?u=")) {
        const body = await response.json();
        const list = body["subsonic-response"].lyricsList?.structuredLyrics ?? [];
        if (list.some((item: { synced: boolean }) => item.synced))
          return Response.json({ "subsonic-response": { ...body["subsonic-response"], lyricsList: { structuredLyrics: [] } } });
        return Response.json(body);
      }
      return response;
    },
  });
  return { stop: () => server.stop(true) };
}
