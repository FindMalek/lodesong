import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { createFolder, listFolders, placePlaylist, removeFolder, updateFolder } from "./playlist-folders";

test("playlist folders: nest to a limit, never into themselves, per account, deleting one lifts what is inside", () => {
  const db = openLibraryDb(":memory:");
  const made = (name: string, parent: string | null = null) => {
    const result = createFolder(db, "a:me", name, parent);
    if (!("folder" in result)) throw new Error(result.error);
    return result.folder.id;
  };
  const top = made("Chill");
  const mid = made("Night", top);
  const deep = made("Late", mid);
  const later = made("Later", deep);
  expect(createFolder(db, "a:me", "Too far", later)).toEqual({ error: "too deep" });
  expect(updateFolder(db, "a:me", top, { parentId: deep })).toEqual({ error: "invalid" });
  expect(updateFolder(db, "a:other", top, { name: "mine now" })).toEqual({ error: "missing" });
  expect(updateFolder(db, "a:me", mid, { parentId: null })).toMatchObject({ folder: { parentId: null } });

  expect(placePlaylist(db, "a:me", "pl-1", deep)).toBe(true);
  expect(placePlaylist(db, "a:other", "pl-2", deep)).toBe(false);
  expect(removeFolder(db, "a:me", mid)).toBe(true);
  const { folders, items } = listFolders(db, "a:me");
  expect(folders.find((folder) => folder.id === deep)?.parentId).toBeNull();
  expect(items).toEqual([{ playlistId: "pl-1", folderId: deep }]);
  expect(removeFolder(db, "a:me", deep)).toBe(true);
  expect(listFolders(db, "a:me").items).toEqual([]);
});
