import { expect, test } from "bun:test";
import { listArtistMerges, setArtistMerge } from "./artist-merges";
import { openLibraryDb } from "./db";

test("artist merges: kept per account, and a reset puts the artist back to the default", () => {
  const db = openLibraryDb(":memory:");
  setArtistMerge(db, "a:me", { key: "shyler", unmerged: true, name: null });
  setArtistMerge(db, "a:other", { key: "shyler", unmerged: false, name: "SHYLER" });
  expect(listArtistMerges(db, "a:me")).toEqual([{ key: "shyler", unmerged: true, name: null }]);
  setArtistMerge(db, "a:me", { key: "shyler", unmerged: false, name: null });
  expect(listArtistMerges(db, "a:me")).toEqual([]);
  expect(listArtistMerges(db, "a:other")).toHaveLength(1);
});
