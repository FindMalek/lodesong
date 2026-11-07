import type { Database } from "bun:sqlite";
import { type FitReason, fitsSound, playlistFit, type Sound } from "@lodesong/shared/vibe-fit";
import { fitsPlaylist, type Vibe, vibeOf } from "@lodesong/shared/vibes";
import type { Cache } from "./cache";
import type { Upstream } from "./config";
import { createFailures, type Failures, listPlaylists, type PlaylistRef, syncPlaylistSongs } from "./playlist-songs";
import type { Session } from "./sessions";

// The playlists that suit a mood: their songs' AudioMuse features against the mood's profile, plus the name.

export interface MoodPlaylist {
  id: string;
  name: string;
  reasons: FitReason[];
  fit: number | null;
  analysed: number;
}

export interface MoodPlaylists {
  mood: string;
  playlists: MoodPlaylist[];
  complete: boolean;
}

const NAME_BONUS = 0.5;
const MAX_RESULTS = 8;
const TTL_MS = 10 * 60_000;

function soundsOf(db: Database, server: string, account: string): Map<string, Sound[]> {
  const rows = db
    .query<{ id: string; energy: number; valence: number; bpm: number }, [string, string]>(
      `select p.playlist_id as id, f.energy, f.valence, f.bpm
       from playlist_songs p cross join json_each(p.songs) j
       cross join song_features f on f.server = ? and f.song_id = j.value
       where p.account = ?`,
    )
    .all(server, account);
  const byPlaylist = new Map<string, Sound[]>();
  for (const { id, ...sound } of rows) {
    const heard = byPlaylist.get(id);
    if (heard) heard.push(sound);
    else byPlaylist.set(id, [sound]);
  }
  return byPlaylist;
}

function rankPlaylists(vibe: Vibe, playlists: PlaylistRef[], sounds: Map<string, Sound[]>): MoodPlaylist[] {
  const ranked = playlists.flatMap((playlist) => {
    const heard = sounds.get(playlist.id) ?? [];
    const fit = playlistFit(vibe.profile, heard);
    const sounding = fitsSound(fit, heard.length, playlist.songs);
    const named = fitsPlaylist(vibe, playlist.name);
    if (!sounding && !named) return [];
    const reasons: FitReason[] = [...(named ? (["name"] as const) : []), ...(sounding ? fit.reasons : [])];
    const found: MoodPlaylist = {
      id: playlist.id,
      name: playlist.name,
      reasons,
      fit: sounding ? Math.round(fit.score * 100) / 100 : null,
      analysed: heard.length,
    };
    return [{ found, rank: (sounding ? fit.score * (heard.length / playlist.songs) : 0) + (named ? NAME_BONUS : 0) }];
  });
  return ranked
    .sort((a, b) => b.rank - a.rank || a.found.name.localeCompare(b.found.name) || a.found.id.localeCompare(b.found.id))
    .slice(0, MAX_RESULTS)
    .map(({ found }) => found);
}

/** Every sync writes its rows with a new rowid and none are deleted, so the highest one moves whenever a feature may have. */
const featuresVersion = (db: Database): number =>
  db.query<{ last: number | null }, []>("select max(rowid) as last from song_features").get()?.last ?? 0;

const playlistsVersion = (playlists: PlaylistRef[]): string => Bun.hash(JSON.stringify(playlists)).toString(36);

export function createMoodPlaylists(db: Database, cache: Cache, failures: Failures = createFailures()) {
  const reading = new Map<string, Promise<boolean>>();
  return async (upstream: Upstream, session: Session, words: string): Promise<MoodPlaylists | null> => {
    const vibe = vibeOf(words);
    if (!vibe) return { mood: "", playlists: [], complete: true };
    const playlists = await listPlaylists(upstream, session);
    if (!playlists) return null;
    const account = `${session.server}:${session.user}`;
    const version = playlistsVersion(playlists);
    const key = `mood:${account}:${vibe.label}:${version}:${featuresVersion(db)}`;
    const cached = await cache.get<MoodPlaylists>(key);
    if (cached) return cached;
    // Typing fires several requests at once: those that saw the same playlists share one read of them.
    const sharing = `${account}:${version}`;
    const pending = reading.get(sharing) ?? syncPlaylistSongs(db, upstream, session, account, playlists, undefined, failures);
    reading.set(sharing, pending);
    const complete = await pending.finally(() => reading.delete(sharing));
    const result = { mood: vibe.label, playlists: rankPlaylists(vibe, playlists, soundsOf(db, session.server, account)), complete };
    if (complete) await cache.set(key, result, TTL_MS);
    return result;
  };
}
