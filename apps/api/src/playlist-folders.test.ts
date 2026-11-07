import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import {
  createFolder,
  folderCover,
  forgetPlaylist,
  importFolders,
  listFolders,
  placePlaylist,
  removeFolder,
  updateFolder,
} from "./playlist-folders";

const ME = "a:me";
const OTHER = "a:other";

function setup() {
  const db = openLibraryDb(":memory:");
  const made = (name: string, parent: string | null = null, account = ME, id?: string) => {
    const result = createFolder(db, account, name, parent, undefined, id);
    if (!("folder" in result)) throw new Error(result.error);
    return result.folder.id;
  };
  const chain = (names: string[]) => names.reduce<string | null>((parent, name) => made(name, parent), null) as string;
  return { db, made, chain };
}

const cover = { type: "image/png", bytes: new Uint8Array([1, 2, 3]), hash: "abc" };

test("create: a folder needs a parent that is yours, a sane name, and room under the depth and count limits", () => {
  const { db, made, chain } = setup();
  const top = made("Chill");
  expect(createFolder(db, OTHER, "Sneaky", top)).toEqual({ error: "missing" });
  expect(createFolder(db, ME, "x".repeat(81), null)).toEqual({ error: "invalid" });
  expect(createFolder(db, ME, "   ", null)).toEqual({ error: "invalid" });
  expect(createFolder(db, ME, "Two", null, 1)).toEqual({ error: "too many" });
  const last = chain(["a", "b", "c", "d"]);
  expect(createFolder(db, ME, "five", last)).toEqual({ error: "too deep" });
  expect(listFolders(db, OTHER).folders).toEqual([]);
});

test("move: nesting counts what is inside, never into itself, and only your own folders", () => {
  const { db, made, chain } = setup();
  const c = chain(["a", "b", "c"]);
  const x = made("x");
  const y = made("y", x);
  expect(updateFolder(db, ME, x, { parentId: c })).toEqual({ error: "too deep" });
  expect(updateFolder(db, ME, y, { parentId: c })).toMatchObject({ folder: { parentId: c } });
  const z = made("z", x);
  expect(updateFolder(db, ME, x, { parentId: z })).toEqual({ error: "invalid" });
  expect(updateFolder(db, ME, x, { parentId: x })).toEqual({ error: "invalid" });
  expect(updateFolder(db, ME, x, { parentId: "nope" })).toEqual({ error: "missing" });
  expect(updateFolder(db, ME, x, { name: "y".repeat(81) })).toEqual({ error: "invalid" });
  expect(updateFolder(db, OTHER, x, { name: "mine now" })).toEqual({ error: "missing" });
  expect(updateFolder(db, ME, c, { parentId: null })).toMatchObject({ folder: { parentId: null } });
});

test("remove: what is inside moves up to the parent, or to the top, and nothing of another account moves", () => {
  const { db, made } = setup();
  const top = made("top");
  const mid = made("mid", top);
  const deep = made("deep", mid);
  placePlaylist(db, ME, "in-mid", mid);
  placePlaylist(db, ME, "in-deep", deep);
  expect(removeFolder(db, ME, mid)).toBe(true);
  const { folders, items } = listFolders(db, ME);
  expect(folders.find((folder) => folder.id === deep)?.parentId).toBe(top);
  expect(items.sort((a, b) => a.playlistId.localeCompare(b.playlistId))).toEqual([
    { playlistId: "in-deep", folderId: deep },
    { playlistId: "in-mid", folderId: top },
  ]);
  expect(removeFolder(db, ME, top)).toBe(true);
  expect(listFolders(db, ME).items).toEqual([{ playlistId: "in-deep", folderId: deep }]);
  expect(removeFolder(db, ME, "nope")).toBe(false);
});

test("two accounts with the same folder and playlist ids: removing, placing and forgetting only touch the caller's", () => {
  const { db, made } = setup();
  for (const account of [ME, OTHER]) {
    const parent = made("parent", null, account, "p");
    made("kid", parent, account, "same");
    placePlaylist(db, account, "pl", "same");
    placePlaylist(db, account, "pl-2", "p");
    updateFolder(db, account, "same", { cover });
  }
  placePlaylist(db, ME, "pl", null);
  forgetPlaylist(db, ME, "pl-2");
  expect(listFolders(db, ME).items).toEqual([]);
  expect(listFolders(db, OTHER).items).toHaveLength(2);

  expect(removeFolder(db, ME, "same")).toBe(true);
  expect(folderCover(db, ME, "same")).toBeNull();
  expect(folderCover(db, OTHER, "same")?.hash).toBe("abc");
  expect(listFolders(db, OTHER).items.find((item) => item.playlistId === "pl")?.folderId).toBe("same");

  expect(removeFolder(db, ME, "p")).toBe(true);
  expect(listFolders(db, ME).folders).toEqual([]);
  expect(listFolders(db, OTHER).folders.map((folder) => [folder.id, folder.parentId])).toEqual([
    ["p", null],
    ["same", "p"],
  ]);
  expect(listFolders(db, OTHER).items).toHaveLength(2);
});

test("place: only into your own folder, and an account holds a bounded number of placements", () => {
  const { db, made } = setup();
  const mine = made("mine");
  expect(placePlaylist(db, OTHER, "pl", mine)).toEqual({ error: "missing" });
  expect(placePlaylist(db, ME, "pl", "nope")).toEqual({ error: "missing" });
  expect(placePlaylist(db, ME, "pl", mine)).toEqual({ ok: true });
  const fill = db.query("insert into playlist_folder_items (account, playlist_id, folder_id) values (?, ?, ?)");
  for (let at = 0; at < 1999; at += 1) fill.run(ME, `fill-${at}`, mine);
  expect(placePlaylist(db, ME, "one-too-many", mine)).toEqual({ error: "too many" });
  expect(placePlaylist(db, ME, "pl", mine)).toEqual({ ok: true });
});

test("cover: set, replaced, cleared, and the list only carries its version", () => {
  const { db, made } = setup();
  const id = made("pic");
  expect(updateFolder(db, ME, id, { cover })).toMatchObject({ folder: { coverVersion: "abc" } });
  expect(listFolders(db, ME).folders[0]).toEqual({ id, parentId: null, name: "pic", coverVersion: "abc" });
  expect(folderCover(db, ME, id)?.type).toBe("image/png");
  expect(folderCover(db, OTHER, id)).toBeNull();
  expect(updateFolder(db, ME, id, { name: "renamed" })).toMatchObject({ folder: { coverVersion: "abc" } });
  expect(updateFolder(db, ME, id, { cover: null })).toMatchObject({ folder: { coverVersion: null } });
  expect(folderCover(db, ME, id)).toBeNull();
});

test("import: a tree lands in one go, and a refused entry leaves nothing behind", () => {
  const { db, made, chain } = setup();
  const root = made("root");
  const ok = importFolders(db, ME, {
    parentId: root,
    folders: [
      { parent: null, name: "Old", playlists: ["a"] },
      { parent: 0, name: "Night", playlists: ["b", "c"] },
    ],
  });
  expect(ok).toEqual({ ok: true });
  const { folders, items } = listFolders(db, ME);
  const old = folders.find((folder) => folder.name === "Old");
  expect(old?.parentId).toBe(root);
  expect(folders.find((folder) => folder.name === "Night")?.parentId).toBe(old?.id);
  expect(items).toHaveLength(3);

  const deep = chain(["a", "b"]);
  const before = listFolders(db, ME);
  const refused = importFolders(db, ME, {
    parentId: deep,
    folders: [
      { parent: null, name: "fine", playlists: ["x"] },
      { parent: 0, name: "too", playlists: [] },
      { parent: 1, name: "far", playlists: [] },
    ],
  });
  expect(refused).toEqual({ error: "too deep" });
  expect(listFolders(db, ME)).toEqual(before);
  expect(importFolders(db, ME, { parentId: null, folders: [{ parent: 0, name: "loop", playlists: [] }] })).toEqual({ error: "invalid" });
  expect(importFolders(db, ME, { parentId: "nope", folders: [{ parent: null, name: "lost", playlists: [] }] })).toEqual({
    error: "missing",
  });
  expect(importFolders(db, ME, { parentId: null, folders: [{ parent: null, name: "cap", playlists: [] }] }, 1)).toEqual({
    error: "too many",
  });
});
