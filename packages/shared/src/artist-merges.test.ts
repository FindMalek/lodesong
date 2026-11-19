import { expect, test } from "bun:test";
import { groupArtists, shownName } from "./artist-merges";

const shyler = [
  { id: "1", name: "SHYLER", albumCount: 2 },
  { id: "2", name: "Shyler", albumCount: 1 },
];

test("the same artist in two spellings is one group, with every id and the albums summed", () => {
  const [group, ...rest] = groupArtists([...shyler, { id: "3", name: "Other", albumCount: 4 }]);
  expect(rest).toHaveLength(1);
  expect(group).toMatchObject({ id: "1", ids: ["1", "2"], albumCount: 3, name: "Shyler", names: ["Shyler", "SHYLER"] });
});

test("the most common spelling shows, a tie goes to mixed case, and all caps gives way to mixed case", () => {
  expect(shownName([{ name: "Shyler" }, { name: "shyler" }, { name: "shyler" }])).toBe("shyler");
  expect(shownName([{ name: "SHYLER" }, { name: "Shyler" }])).toBe("Shyler");
  expect(shownName([{ name: "SHYLER" }, { name: "SHYLER" }, { name: "Shyler" }])).toBe("Shyler");
});

test("a spelling the user picked wins, and an unmerged artist splits back to one group per id", () => {
  const key = "shyler";
  expect(groupArtists(shyler, [{ key, unmerged: false, name: "SHYLER" }])[0]?.name).toBe("SHYLER");
  expect(groupArtists(shyler, [{ key, unmerged: true, name: null }]).map((group) => group.id)).toEqual(["1", "2"]);
});
