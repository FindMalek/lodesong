import { expect, test } from "bun:test";
import { coverView } from "./playlist-cover-view";

test("a playlist without a saved choice keeps the mosaic; a dither or picture is read from its row", () => {
  const covers = [
    { playlistId: "a", kind: "dither" as const, version: "dither" },
    { playlistId: "b", kind: "image" as const, version: "abc" },
  ];
  expect(coverView(covers, "z")).toEqual({ kind: "mosaic" });
  expect(coverView(covers, "a")).toEqual({ kind: "dither" });
  expect(coverView(covers, "b")).toEqual({ kind: "image", url: "/api/playlists/b/cover?v=abc" });
});
