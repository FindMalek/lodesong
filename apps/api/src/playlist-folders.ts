import type { Database } from "bun:sqlite";
import {
  type FolderImport,
  type FolderReason,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_ITEMS,
  MAX_FOLDERS,
  MAX_NAME_LENGTH,
  type PlaylistFolder,
  type PlaylistFolders,
} from "@lodesong/shared/playlist-folders";
import type { Cover } from "./folder-cover";

// Navidrome has no playlist folders: they live here per account and only point at playlist ids, so names stay untouched.
// A playlist deleted in Navidrome leaves a dead row that the player ignores; moving or deleting a folder never reads Navidrome.

export function createPlaylistFolderTables(db: Database): void {
  db.run(`create table if not exists playlist_folders (
    account text not null,
    id text not null,
    parent_id text,
    name text not null,
    primary key (account, id)
  )`);
  db.run(`create table if not exists playlist_folder_items (
    account text not null,
    playlist_id text not null,
    folder_id text not null,
    primary key (account, playlist_id)
  )`);
  db.run(`create table if not exists playlist_folder_covers (
    account text not null,
    folder_id text not null,
    type text not null,
    hash text not null,
    bytes blob not null,
    primary key (account, folder_id)
  )`);
}

type Row = { id: string; parent_id: string | null; name: string; hash: string | null };

const toFolder = (row: Row): PlaylistFolder => ({ id: row.id, parentId: row.parent_id, name: row.name, coverVersion: row.hash });

export function listFolders(db: Database, account: string): PlaylistFolders {
  const folders = db
    .query<Row, [string]>(
      `select f.id, f.parent_id, f.name, c.hash from playlist_folders f
       left join playlist_folder_covers c on c.account = f.account and c.folder_id = f.id
       where f.account = ? order by f.rowid`,
    )
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

export function folderCover(db: Database, account: string, id: string): Cover | null {
  return db
    .query<Cover, [string, string]>("select type, hash, bytes from playlist_folder_covers where account = ? and folder_id = ?")
    .get(account, id);
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

const cleanName = (name: string): string => name.trim().replace(/\s+/g, " ");

export type FolderResult = { folder: PlaylistFolder } | { error: FolderReason };

export function createFolder(
  db: Database,
  account: string,
  name: string,
  parentId: string | null,
  limit = MAX_FOLDERS,
  id: string = crypto.randomUUID(),
): FolderResult {
  const { folders } = listFolders(db, account);
  const clean = cleanName(name);
  if (!clean || clean.length > MAX_NAME_LENGTH) return { error: "invalid" };
  if (parentId !== null && !folders.some((folder) => folder.id === parentId)) return { error: "missing" };
  if (folders.length >= limit) return { error: "too many" };
  if (depthOf(folders, parentId) + 1 > MAX_FOLDER_DEPTH) return { error: "too deep" };
  db.query("insert into playlist_folders (account, id, parent_id, name) values (?, ?, ?, ?)").run(account, id, parentId, clean);
  return { folder: { id, parentId, name: clean, coverVersion: null } };
}

export interface FolderChange {
  name?: string;
  parentId?: string | null;
  cover?: Cover | null;
}

export function updateFolder(db: Database, account: string, id: string, change: FolderChange): FolderResult {
  const { folders } = listFolders(db, account);
  const current = folders.find((folder) => folder.id === id);
  if (!current) return { error: "missing" };
  const next = { ...current };
  if (change.name !== undefined) {
    next.name = cleanName(change.name);
    if (!next.name || next.name.length > MAX_NAME_LENGTH) return { error: "invalid" };
  }
  if (change.parentId !== undefined && change.parentId !== current.parentId) {
    const parent = change.parentId;
    if (parent !== null && !folders.some((folder) => folder.id === parent)) return { error: "missing" };
    if (parent !== null && isInside(folders, parent, id)) return { error: "invalid" };
    if (depthOf(folders, parent) + heightOf(folders, id) > MAX_FOLDER_DEPTH) return { error: "too deep" };
    next.parentId = parent;
  }
  db.transaction(() => {
    db.query("update playlist_folders set name = ?, parent_id = ? where account = ? and id = ?").run(next.name, next.parentId, account, id);
    if (change.cover === null) db.query("delete from playlist_folder_covers where account = ? and folder_id = ?").run(account, id);
    else if (change.cover)
      db.query("insert or replace into playlist_folder_covers (account, folder_id, type, hash, bytes) values (?, ?, ?, ?, ?)").run(
        account,
        id,
        change.cover.type,
        change.cover.hash,
        change.cover.bytes,
      );
  })();
  if (change.cover !== undefined) next.coverVersion = change.cover?.hash ?? null;
  return { folder: next };
}

/** Folders and playlists inside move up to the deleted folder's parent; nothing in Navidrome is touched. */
export function removeFolder(db: Database, account: string, id: string): boolean {
  const { folders } = listFolders(db, account);
  const current = folders.find((folder) => folder.id === id);
  if (!current) return false;
  db.transaction(() => {
    db.query("update playlist_folders set parent_id = ? where account = ? and parent_id = ?").run(current.parentId, account, id);
    if (current.parentId)
      db.query("update playlist_folder_items set folder_id = ? where account = ? and folder_id = ?").run(current.parentId, account, id);
    else db.query("delete from playlist_folder_items where account = ? and folder_id = ?").run(account, id);
    db.query("delete from playlist_folder_covers where account = ? and folder_id = ?").run(account, id);
    db.query("delete from playlist_folders where account = ? and id = ?").run(account, id);
  })();
  return true;
}

export type PlaceResult = { ok: true } | { error: FolderReason };

export function placePlaylist(db: Database, account: string, playlistId: string, folderId: string | null): PlaceResult {
  if (folderId === null) {
    db.query("delete from playlist_folder_items where account = ? and playlist_id = ?").run(account, playlistId);
    return { ok: true };
  }
  const { folders, items } = listFolders(db, account);
  if (!folders.some((folder) => folder.id === folderId)) return { error: "missing" };
  if (items.length >= MAX_FOLDER_ITEMS && !items.some((item) => item.playlistId === playlistId)) return { error: "too many" };
  db.query("insert or replace into playlist_folder_items (account, playlist_id, folder_id) values (?, ?, ?)").run(
    account,
    playlistId,
    folderId,
  );
  return { ok: true };
}

export function forgetPlaylist(db: Database, account: string, playlistId: string): void {
  db.query("delete from playlist_folder_items where account = ? and playlist_id = ?").run(account, playlistId);
}

class Refused extends Error {
  constructor(readonly reason: FolderReason) {
    super(reason);
  }
}

/** Makes a whole tree of folders (and puts playlists in them) in one go: either all of it, or none. */
export function importFolders(db: Database, account: string, request: FolderImport, limit = MAX_FOLDERS): PlaceResult {
  const made: string[] = [];
  try {
    db.transaction(() => {
      request.folders.forEach((entry, index) => {
        if (entry.parent !== null && entry.parent >= index) throw new Refused("invalid");
        const parent = entry.parent === null ? request.parentId : (made[entry.parent] ?? null);
        const result = createFolder(db, account, entry.name, parent, limit);
        if ("error" in result) throw new Refused(result.error);
        made.push(result.folder.id);
        for (const playlistId of entry.playlists) {
          const placed = placePlaylist(db, account, playlistId, result.folder.id);
          if ("error" in placed) throw new Refused(placed.error);
        }
      });
    })();
  } catch (error) {
    if (error instanceof Refused) return { error: error.reason };
    throw error;
  }
  return { ok: true };
}
