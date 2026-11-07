import type { Upstream } from "./config";
import { type Credentials, subsonic } from "./subsonic";

/** True when every id is a playlist this user can see in Navidrome. */
export async function playlistsExist(upstream: Upstream, who: Credentials, ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return true;
  if (wanted.length === 1) return Boolean(await subsonic(upstream, who, "getPlaylist", { id: wanted[0] ?? "" }));
  const all = await subsonic<{ playlists: { playlist?: { id: string }[] } }>(upstream, who, "getPlaylists");
  const known = new Set((all?.playlists.playlist ?? []).map((playlist) => playlist.id));
  return wanted.every((id) => known.has(id));
}
