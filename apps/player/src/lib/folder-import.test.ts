import { expect, test } from "bun:test";
import { legacyEntries } from "./folder-import";
import type { FolderNode } from "./folder-tree";
import type { Playlist } from "./types";

const node = (name: string, playlists: string[], folders: FolderNode[] = []): FolderNode => ({
  id: null,
  name,
  key: name,
  cover: null,
  folders,
  playlists: playlists.map((id) => ({ id, name: id }) as Playlist),
});

test("a legacy group becomes a list of folders, and what nests past four levels joins the fourth", () => {
  const six = node("L1", ["a"], [node("L2", ["b"], [node("L3", [], [node("L4", ["c"], [node("L5", ["d"], [node("L6", ["e"])])])])])]);
  expect(legacyEntries(six)).toEqual([
    { parent: null, name: "L1", playlists: ["a"] },
    { parent: 0, name: "L2", playlists: ["b"] },
    { parent: 1, name: "L3", playlists: [] },
    { parent: 2, name: "L4", playlists: ["c", "d", "e"] },
  ]);
  const wide = legacyEntries(node("Top", [], [node("A", ["x"]), node("B", ["y"])]));
  expect(wide.map((entry) => [entry.name, entry.parent])).toEqual([
    ["Top", null],
    ["A", 0],
    ["B", 0],
  ]);
  expect(legacyEntries(node("n".repeat(100), []))[0]?.name).toHaveLength(80);
  const many = Array.from({ length: 205 }, (_, at) => node(`F${at}`, [`p${at}`]));
  const capped = legacyEntries(node("Top", [], many));
  expect(capped).toHaveLength(200);
  expect(capped[0]?.playlists).toEqual(["p199", "p200", "p201", "p202", "p203", "p204"]);
});
