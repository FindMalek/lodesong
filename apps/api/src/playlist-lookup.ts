import type { Upstream } from "./config";
import { type Credentials, upstreamQuery } from "./subsonic";

type Answer = { status?: string; playlists?: { playlist?: { id: string }[] } };

async function ask(upstream: Upstream, who: Credentials, endpoint: string, params: Record<string, string> = {}): Promise<Answer> {
  const query = upstreamQuery(who);
  query.set("f", "json");
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const response = await fetch(`${upstream.url}/rest/${endpoint}?${query}`, { signal: AbortSignal.timeout(15_000) });
  const body = (await response.json()) as { "subsonic-response"?: Answer };
  if (!body["subsonic-response"]) throw new Error("navidrome sent no answer");
  return body["subsonic-response"];
}

/** True when every id is a playlist this user can see in Navidrome. Throws when Navidrome can't be asked, which is not the same as "no". */
export async function playlistsExist(upstream: Upstream, who: Credentials, ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return true;
  if (wanted.length === 1) return (await ask(upstream, who, "getPlaylist", { id: wanted[0] ?? "" })).status === "ok";
  const all = await ask(upstream, who, "getPlaylists");
  if (all.status !== "ok") throw new Error("navidrome refused the list");
  const known = new Set((all.playlists?.playlist ?? []).map((playlist) => playlist.id));
  return wanted.every((id) => known.has(id));
}
