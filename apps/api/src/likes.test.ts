import { expect, test } from "bun:test";
import { likedIds, likesKey } from "./likes";

test("ids come from every kind of starred item, and bad entries or shapes are skipped", () => {
  expect(likedIds({ song: [{ id: "a" }, null, {}, { id: 5 }, "x"], album: [{ id: "b" }], artist: null })).toEqual(new Set(["a", "b"]));
  for (const bad of [undefined, null, "x", 3, [], { song: "a" }]) expect(likedIds(bad)).toEqual(new Set());
});

test("the key follows the likes and not their order, and an unknown answer has its own", () => {
  expect(likesKey(new Set(["a", "b"]))).toBe(likesKey(new Set(["b", "a"])));
  expect(likesKey(new Set(["a", "b"]))).not.toBe(likesKey(new Set(["a"])));
  expect(likesKey(new Set())).not.toBe(likesKey(null));
});
