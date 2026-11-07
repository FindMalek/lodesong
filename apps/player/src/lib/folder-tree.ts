import type { PlaylistFolders } from "@lodesong/shared/playlist-folders";
import type { Playlist } from "./types";

export interface FolderNode {
  id: string | null;
  name: string;
  key: string;
  cover: string | null;
  folders: FolderNode[];
  playlists: Playlist[];
}

const SEPARATOR = " / ";

const folderCoverUrl = (id: string, version: string): string => `/api/folders/${encodeURIComponent(id)}/cover?v=${version}`;

const node = (id: string | null, name: string, key: string, cover: string | null = null): FolderNode => ({
  id,
  name,
  key,
  cover,
  folders: [],
  playlists: [],
});

/** Real folders first, then the old "Chill / Night" naming for playlists that are not in one; a dead id is ignored. */
export function buildTree(playlists: Playlist[], data: PlaylistFolders | undefined): FolderNode {
  const root = node(null, "", "");
  const real = new Map(
    (data?.folders ?? []).map((folder) => [
      folder.id,
      node(folder.id, folder.name, folder.id, folder.coverVersion ? folderCoverUrl(folder.id, folder.coverVersion) : null),
    ]),
  );
  for (const folder of data?.folders ?? []) {
    const parent = folder.parentId ? real.get(folder.parentId) : undefined;
    (parent ?? root).folders.push(real.get(folder.id) as FolderNode);
  }
  const placed = new Map((data?.items ?? []).map((item) => [item.playlistId, item.folderId]));
  for (const playlist of playlists) {
    const inside = real.get(placed.get(playlist.id) ?? "");
    if (inside) {
      inside.playlists.push(playlist);
      continue;
    }
    let at = root;
    for (const part of playlist.name.split(SEPARATOR).slice(0, -1)) {
      const key = `${at.key}/${part}`;
      let next = at.folders.find((folder) => folder.id === null && folder.key === key);
      if (!next) {
        next = node(null, part, key);
        at.folders.push(next);
      }
      at = next;
    }
    at.playlists.push(playlist);
  }
  return sorted(root);
}

function sorted(folder: FolderNode): FolderNode {
  folder.folders.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of folder.folders) sorted(child);
  return folder;
}

export function findFolder(root: FolderNode, id: string): FolderNode | undefined {
  for (const folder of root.folders) {
    const found = folder.id === id ? folder : findFolder(folder, id);
    if (found) return found;
  }
  return undefined;
}

export function findLegacy(root: FolderNode, path: string): FolderNode | undefined {
  let at: FolderNode | undefined = root;
  for (const part of path.split(SEPARATOR)) at = at?.folders.find((folder) => folder.id === null && folder.name === part);
  return at === root ? undefined : at;
}

export function pathTo(root: FolderNode, id: string): FolderNode[] {
  for (const folder of root.folders) {
    if (folder.id === id) return [folder];
    const below = pathTo(folder, id);
    if (below.length) return [folder, ...below];
  }
  return [];
}

/** The old naming inside a real folder: "Chill / Night" in a folder called Chill reads "Night". */
export function shownName(playlist: Playlist, chain: string[]): string {
  const prefix = chain.length ? `${chain.join(SEPARATOR)}${SEPARATOR}` : "";
  if (prefix && playlist.name.startsWith(prefix) && playlist.name.length > prefix.length) return playlist.name.slice(prefix.length);
  return chain.length ? playlist.name : (playlist.name.split(SEPARATOR).at(-1) ?? playlist.name);
}

export function movableInto(root: FolderNode, id: string, limit: number): { id: string; label: string }[] {
  const height = (folder: FolderNode): number => 1 + Math.max(0, ...folder.folders.map(height));
  const moving = findFolder(root, id);
  const out: { id: string; label: string }[] = [];
  const walk = (folders: FolderNode[], names: string[]) => {
    for (const folder of folders) {
      if (folder.id === null || folder.id === id) continue;
      const label = [...names, folder.name];
      if (label.length + (moving ? height(moving) : 1) <= limit) out.push({ id: folder.id, label: label.join(SEPARATOR) });
      walk(folder.folders, label);
    }
  };
  walk(root.folders, []);
  return out;
}

export function folderOptions(root: FolderNode): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (folders: FolderNode[], names: string[]) => {
    for (const folder of folders) {
      const label = [...names, folder.name];
      if (folder.id !== null) out.push({ id: folder.id, label: label.join(SEPARATOR) });
      walk(folder.folders, label);
    }
  };
  walk(root.folders, []);
  return out;
}

export function placedIn(root: FolderNode, playlistId: string): string {
  for (const folder of root.folders) {
    if (folder.id !== null && folder.playlists.some((playlist) => playlist.id === playlistId)) return folder.id;
    const below = placedIn(folder, playlistId);
    if (below) return below;
  }
  return "";
}
