import type { Database } from "bun:sqlite";
import type { Upstream } from "./config";
import { type Credentials, subsonic } from "./subsonic";

// Each account's playlists and the ids of their songs, kept until Navidrome says the playlist changed.

export interface PlaylistRef {
  id: string;
  name: string;
  songs: number;
  changed: string;
}

const CONCURRENCY = 8;
const BUDGET_MS = 5_000;
const MAX_PLAYLISTS = 2_000;
const MAX_SONGS = 2_000;
const MAX_TRIES = 3;
const GIVE_UP_MS = 10 * 60_000;

/** A playlist that failed to read this many times is left out for a while, so one broken playlist can't keep the answer incomplete. */
export function createFailures(now: () => number = Date.now) {
  const seen = new Map<string, { tries: number; at: number }>();
  return {
    gaveUp(key: string): boolean {
      const failure = seen.get(key);
      if (failure && now() - failure.at >= GIVE_UP_MS) seen.delete(key);
      return (seen.get(key)?.tries ?? 0) >= MAX_TRIES;
    },
    failed(key: string): boolean {
      const tries = (seen.get(key)?.tries ?? 0) + 1;
      seen.set(key, { tries, at: now() });
      return tries >= MAX_TRIES;
    },
  };
}

export type Failures = ReturnType<typeof createFailures>;

export function createPlaylistTables(db: Database): void {
  db.run(`create table if not exists playlist_songs (
    account text not null,
    playlist_id text not null,
    changed text not null,
    count integer not null,
    songs text not null,
    primary key (account, playlist_id)
  )`);
}

interface Raw {
  id?: unknown;
  name?: unknown;
  songCount?: unknown;
  changed?: unknown;
  entry?: { id?: unknown }[];
}

export async function listPlaylists(upstream: Upstream, credentials: Credentials): Promise<PlaylistRef[] | null> {
  const found = await subsonic<{ playlists?: { playlist?: Raw[] } }>(upstream, credentials, "getPlaylists");
  if (!found) return null;
  return (found.playlists?.playlist ?? []).slice(0, MAX_PLAYLISTS).flatMap((raw) => {
    if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.songCount !== "number" || raw.songCount < 1) return [];
    return [{ id: raw.id, name: raw.name, songs: raw.songCount, changed: typeof raw.changed === "string" ? raw.changed : "" }];
  });
}

/** Reads the playlists that are new or changed since last time, a few at a time. False if some are still missing. */
export async function syncPlaylistSongs(
  db: Database,
  upstream: Upstream,
  credentials: Credentials,
  account: string,
  playlists: PlaylistRef[],
  budgetMs = BUDGET_MS,
  failures: Failures = createFailures(),
): Promise<boolean> {
  const stored = new Map(
    db
      .query<{ playlist_id: string; changed: string; count: number }, [string]>(
        "select playlist_id, changed, count from playlist_songs where account = ?",
      )
      .all(account)
      .map((row) => [row.playlist_id, row] as const),
  );
  const current = new Set(playlists.map((playlist) => playlist.id));
  const forget = db.query("delete from playlist_songs where account = ? and playlist_id = ?");
  for (const id of stored.keys()) if (!current.has(id)) forget.run(account, id);

  const attempt = (playlist: PlaylistRef) => `${account}:${playlist.id}:${playlist.changed}`;
  const todo = playlists.filter((playlist) => {
    const have = stored.get(playlist.id);
    return (!have || have.changed !== playlist.changed || have.count !== playlist.songs) && !failures.gaveUp(attempt(playlist));
  });
  const save = db.query("insert or replace into playlist_songs (account, playlist_id, changed, count, songs) values (?, ?, ?, ?, ?)");
  const deadline = Date.now() + budgetMs;
  let failed = false;
  const work = async () => {
    while (Date.now() < deadline) {
      const playlist = todo.shift();
      if (!playlist) return;
      const found = await subsonic<{ playlist?: Raw }>(upstream, credentials, "getPlaylist", { id: playlist.id });
      if (!found) {
        if (!failures.failed(attempt(playlist))) failed = true;
        continue;
      }
      const ids = (found.playlist?.entry ?? []).flatMap((entry) => (typeof entry.id === "string" ? [entry.id] : []));
      save.run(account, playlist.id, playlist.changed, playlist.songs, JSON.stringify(ids.slice(0, MAX_SONGS)));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  return !failed && todo.length === 0;
}
