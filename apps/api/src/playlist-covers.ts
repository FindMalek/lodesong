import type { Database } from "bun:sqlite";
import type { PlaylistCoverKind } from "@lodesong/shared/playlist-folders";
import type { Cover } from "./folder-cover";

// Navidrome's own cover for a playlist is the four-album mosaic. A different choice is kept here per account: the dither
// needs no bytes, an uploaded picture keeps them. No row means the mosaic.

export function createPlaylistCoverTable(db: Database): void {
  db.run(`create table if not exists playlist_covers (
    account text not null,
    playlist_id text not null,
    kind text not null,
    type text not null,
    hash text not null,
    bytes blob not null,
    primary key (account, playlist_id)
  )`);
}

export function listPlaylistCovers(db: Database, account: string): { playlistId: string; kind: "dither" | "image"; version: string }[] {
  return db
    .query<{ playlistId: string; kind: "dither" | "image"; version: string }, [string]>(
      "select playlist_id as playlistId, kind, hash as version from playlist_covers where account = ?",
    )
    .all(account);
}

export function playlistCover(db: Database, account: string, id: string): Cover | null {
  return db
    .query<Cover, [string, string]>(
      "select type, hash, bytes from playlist_covers where account = ? and playlist_id = ? and kind = 'image'",
    )
    .get(account, id);
}

export function setPlaylistCover(db: Database, account: string, id: string, kind: PlaylistCoverKind, picture: Cover | null): void {
  if (kind === "mosaic") {
    removePlaylistCover(db, account, id);
    return;
  }
  db.query("insert or replace into playlist_covers (account, playlist_id, kind, type, hash, bytes) values (?, ?, ?, ?, ?, ?)").run(
    account,
    id,
    kind,
    picture?.type ?? "",
    picture?.hash ?? "dither",
    picture?.bytes ?? new Uint8Array(0),
  );
}

export function removePlaylistCover(db: Database, account: string, id: string): void {
  db.query("delete from playlist_covers where account = ? and playlist_id = ?").run(account, id);
}

/** A playlist deleted in Navidrome (or from another client) leaves its picture here, and Navidrome may reuse the id. */
export function sweepPlaylistCovers(db: Database, account: string, known: Set<string>): void {
  for (const { playlistId } of listPlaylistCovers(db, account)) if (!known.has(playlistId)) removePlaylistCover(db, account, playlistId);
}
