import { expect, test } from "bun:test";
import { buildTree, movableInto, shownName } from "./folder-tree";
import type { Playlist } from "./types";

const playlist = (id: string, name: string): Playlist => ({ id, name, songCount: 0, duration: 0 });

test("folder tree: real folders hold placed playlists, the old naming still folds the rest, dead ids are ignored", () => {
  const playlists = [playlist("a", "Chill / Night"), playlist("b", "Focus"), playlist("c", "Trips / Rome")];
  const data = {
    folders: [
      { id: "f1", parentId: null, name: "Mine", cover: null },
      { id: "f2", parentId: "f1", name: "Deep", cover: null },
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
  expect(movableInto(root, "f2", 4).map((option) => option.label)).toEqual(["Mine"]);
});
