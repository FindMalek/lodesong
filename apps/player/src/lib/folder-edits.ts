import type { PlaylistFolder, PlaylistFolders } from "@lodesong/shared/playlist-folders";
import type { FolderNode } from "./folder-tree";
import { notify } from "./notify";
import { foldersQuery } from "./playlist-folders";
import { queryClient } from "./queries";
import { rpc } from "./rpc";

const refresh = () => queryClient.invalidateQueries({ queryKey: foldersQuery().queryKey });
const failed = (what: string) => notify({ kind: "error", message: `couldn't ${what}` });

export async function createFolder(name: string, parentId: string | null): Promise<PlaylistFolder | null> {
  const folder = await rpc.folders.create.call({ name, parentId }).catch(() => null);
  if (!folder) failed("make that folder, it may be nested too deep");
  await refresh();
  return folder;
}

export async function changeFolder(
  id: string,
  change: { name?: string; parentId?: string | null; cover?: string | null },
): Promise<boolean> {
  const folder = await rpc.folders.update.call({ id, ...change }).catch(() => null);
  if (!folder) failed("save that folder, it may be nested too deep or the picture too big");
  await refresh();
  return Boolean(folder);
}

export async function deleteFolder(id: string): Promise<void> {
  await rpc.folders.remove.call({ id }).catch(() => failed("delete that folder"));
  await refresh();
}

export async function placePlaylist(playlistId: string, folderId: string | null): Promise<void> {
  queryClient.setQueryData(foldersQuery().queryKey, (current?: PlaylistFolders) => {
    if (!current) return current;
    const items = current.items.filter((item) => item.playlistId !== playlistId);
    return { ...current, items: folderId ? [...items, { playlistId, folderId }] : items };
  });
  const next = await rpc.folders.place.call({ id: playlistId, folderId }).catch(() => null);
  if (next) queryClient.setQueryData(foldersQuery().queryKey, next);
  else {
    failed("move that playlist");
    await refresh();
  }
}

/** Turns an old "Chill / Night" folder, and the ones inside it, into real folders; the playlists keep their names. */
export async function convertFolder(node: FolderNode, parentId: string | null): Promise<void> {
  const made = await rpc.folders.create.call({ name: node.name, parentId });
  for (const playlist of node.playlists) await placePlaylist(playlist.id, made.id);
  for (const child of node.folders) await convertFolder(child, made.id);
  await refresh();
}

const COVER_SIZE = 256;

/** An uploaded picture, cropped square and shrunk to a small JPEG so it can live in the database. */
export async function coverFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const canvas = document.createElement("canvas");
  canvas.width = COVER_SIZE;
  canvas.height = COVER_SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
