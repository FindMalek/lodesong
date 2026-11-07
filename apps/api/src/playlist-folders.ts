import type { Database } from "bun:sqlite";
import { MAX_FOLDER_DEPTH, type PlaylistFolder, type PlaylistFolders } from "@lodesong/shared/playlist-folders";

// Navidrome has no playlist folders: they live here per account and only point at playlist ids, so names stay untouched.
// A playlist deleted in Navidrome leaves a dead row that the player ignores; moving or deleting a folder never reads Navidrome.

export function createPlaylistFolderTables(db: Database): void {
  db.run(`create table if not exists playlist_folders (
    account text not null,
    id text not null,
    parent_id text,
    name text not null,
    cover text,
    primary key (account, id)
  )`);
  db.run(`create table if not exists playlist_folder_items (
    account text not null,
    playlist_id text not null,
    folder_id text not null,
    primary key (account, playlist_id)
  )`);
}

type Row = { id: string; parent_id: string | null; name: string; cover: string | null };

const toFolder = (row: Row): PlaylistFolder => ({ id: row.id, parentId: row.parent_id, name: row.name, cover: row.cover });

export function listFolders(db: Database, account: string): PlaylistFolders {
  const folders = db
    .query<Row, [string]>("select id, parent_id, name, cover from playlist_folders where account = ? order by rowid")
    .all(account)
    .map(toFolder);
  const items = db
    .query<{ playlist_id: string; folder_id: string }, [string]>(
      "select playlist_id, folder_id from playlist_folder_items where account = ?",
    )
    .all(account)
    .map((row) => ({ playlistId: row.playlist_id, folderId: row.folder_id }));
  return { folders, items };
}

const depthOf = (folders: PlaylistFolder[], id: string | null): number => {
  let depth = 0;
  for (let at = id; at && depth <= MAX_FOLDER_DEPTH; at = folders.find((folder) => folder.id === at)?.parentId ?? null) depth += 1;
  return depth;
};

const heightOf = (folders: PlaylistFolder[], id: string): number =>
  1 + Math.max(0, ...folders.filter((folder) => folder.parentId === id).map((folder) => heightOf(folders, folder.id)));

const isInside = (folders: PlaylistFolder[], id: string, ancestor: string): boolean => {
  for (let at: string | null = id, steps = 0; at && steps <= folders.length; steps += 1) {
    if (at === ancestor) return true;
    at = folders.find((folder) => folder.id === at)?.parentId ?? null;
  }
  return false;
};

const cleanName = (name: string): string => name.trim().replace(/\s+/g, " ").slice(0, 80);

export type FolderResult = { folder: PlaylistFolder } | { error: "missing" | "invalid" | "too deep" };

export function createFolder(db: Database, account: string, name: string, parentId: string | null, id = crypto.randomUUID()): FolderResult {
  const { folders } = listFolders(db, account);
  const clean = cleanName(name);
  if (!clean) return { error: "invalid" };
  if (parentId && !folders.some((folder) => folder.id === parentId)) return { error: "missing" };
  if (depthOf(folders, parentId) + 1 > MAX_FOLDER_DEPTH) return { error: "too deep" };
  db.query("insert into playlist_folders (account, id, parent_id, name, cover) values (?, ?, ?, ?, null)").run(
    account,
    id,
    parentId,
    clean,
  );
  return { folder: { id, parentId, name: clean, cover: null } };
}

export interface FolderChange {
  name?: string;
  parentId?: string | null;
  cover?: string | null;
}

export function updateFolder(db: Database, account: string, id: string, change: FolderChange): FolderResult {
  const { folders } = listFolders(db, account);
  const current = folders.find((folder) => folder.id === id);
  if (!current) return { error: "missing" };
  const next = { ...current };
  if (change.name !== undefined) {
    next.name = cleanName(change.name);
    if (!next.name) return { error: "invalid" };
  }
  if (change.cover !== undefined) next.cover = change.cover;
  if (change.parentId !== undefined && change.parentId !== current.parentId) {
    const parent = change.parentId;
    if (parent && !folders.some((folder) => folder.id === parent)) return { error: "missing" };
    if (parent && isInside(folders, parent, id)) return { error: "invalid" };
    if (depthOf(folders, parent) + heightOf(folders, id) > MAX_FOLDER_DEPTH) return { error: "too deep" };
    next.parentId = parent;
  }
  db.query("update playlist_folders set name = ?, parent_id = ?, cover = ? where account = ? and id = ?").run(
    next.name,
    next.parentId,
    next.cover,
    account,
    id,
  );
  return { folder: next };
}

/** Folders and playlists inside move up to the deleted folder's parent; nothing in Navidrome is touched. */
export function removeFolder(db: Database, account: string, id: string): boolean {
  const { folders } = listFolders(db, account);
  const current = folders.find((folder) => folder.id === id);
  if (!current) return false;
  db.query("update playlist_folders set parent_id = ? where account = ? and parent_id = ?").run(current.parentId, account, id);
  if (current.parentId)
    db.query("update playlist_folder_items set folder_id = ? where account = ? and folder_id = ?").run(current.parentId, account, id);
  else db.query("delete from playlist_folder_items where account = ? and folder_id = ?").run(account, id);
  db.query("delete from playlist_folders where account = ? and id = ?").run(account, id);
  return true;
}

export function placePlaylist(db: Database, account: string, playlistId: string, folderId: string | null): boolean {
  if (folderId === null) {
    db.query("delete from playlist_folder_items where account = ? and playlist_id = ?").run(account, playlistId);
    return true;
  }
  if (!listFolders(db, account).folders.some((folder) => folder.id === folderId)) return false;
  db.query("insert or replace into playlist_folder_items (account, playlist_id, folder_id) values (?, ?, ?)").run(
    account,
    playlistId,
    folderId,
  );
  return true;
}
