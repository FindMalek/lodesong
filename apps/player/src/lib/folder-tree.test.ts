import { expect, test } from "bun:test";
import { buildTree, folderOptions, movableInto, placedIn, shownName } from "./folder-tree";
import type { Playlist } from "./types";

const playlist = (id: string, name: string): Playlist => ({ id, name, songCount: 0, duration: 0 });

test("folder tree: real folders hold placed playlists, the old naming still folds the rest, dead ids are ignored", () => {
  const playlists = [playlist("a", "Chill / Night"), playlist("b", "Focus"), playlist("c", "Trips / Rome")];
  const data = {
    folders: [
      { id: "f1", parentId: null, name: "Mine", coverVersion: "v1" },
      { id: "f2", parentId: "f1", name: "Deep", coverVersion: null },
    ],
    items: [
      { playlistId: "b", folderId: "f2" },
      { playlistId: "gone", folderId: "f1" },
      { playlistId: "c", folderId: "missing" },
    ],
  };
  const root = buildTree(playlists, data);
  expect(root.folders.map((folder) => folder.name)).toEqual(["Chill", "Mine", "Trips"]);
  const mine = root.folders.find((folder) => folder.id === "f1");
  expect(mine?.playlists).toEqual([]);
  expect(mine?.folders[0]?.playlists.map((item) => item.id)).toEqual(["b"]);
  expect(root.folders.find((folder) => folder.name === "Trips")?.playlists.map((item) => item.id)).toEqual(["c"]);
  expect(shownName(playlist("x", "Mine / Deep / Song"), ["Mine", "Deep"])).toBe("Song");
  expect(shownName(playlist("y", "Song"), ["Mine"])).toBe("Song");
  expect(movableInto(root, "f1", 4).map((option) => option.label)).toEqual([]);
  expect(mine?.cover).toBe("/api/folders/f1/cover?v=v1");
  expect(mine?.folders[0]?.cover).toBeNull();
  expect(folderOptions(root).map((option) => option.label)).toEqual(["Mine", "Mine / Deep"]);
  expect(placedIn(root, "b")).toBe("f2");
  expect(placedIn(root, "a")).toBe("");
  expect(movableInto(root, "f2", 4).map((option) => option.label)).toEqual(["Mine"]);
});
