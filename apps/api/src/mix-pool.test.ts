import { expect, test } from "bun:test";
import { artistPool } from "./mix-pool";
import type { Listening } from "./mixes";

const listeningOf = (rows: Record<string, [string, number][]>, library: string[]): Listening => ({
  plays: [],
  byArtist: new Map(library.map((artist) => [artist, []])),
  counts: new Map(),
  playedKeys: new Set(),
  together: new Map(Object.entries(rows).map(([artist, row]) => [artist, new Map(row)])),
});

test("equal weights are broken alphabetically, and artists missing from the library never take a slot", () => {
  const l = listeningOf(
    {
      s: [
        ["z", 1],
        ["y", 1],
        ["x", 1],
        ["w", 1],
        ["v", 1],
        ["u", 1],
        ["t", 1],
        ["ghost", 9],
      ],
    },
    ["s", "t", "u", "v", "w", "x", "y", "z"],
  );
  expect(artistPool(l, "s")).toEqual(["s", "t", "u", "v", "w", "x"]);
});

test("the second ring fills what is left of the pool alphabetically when weights tie", () => {
  const near = ["n1", "n2", "n3", "n4", "n5"];
  const far = (n: string) => ["f", "e", "d", "c"].map((k): [string, number] => [`${"zyxwv"[near.indexOf(n)]}${k}`, 1]);
  const rows = Object.fromEntries([["s", near.map((n): [string, number] => [n, 1])], ...near.map((n) => [n, far(n)])]);
  const library = ["s", ...near, ...near.flatMap((n) => far(n).map(([name]) => name))];
  const pool = artistPool(listeningOf(rows, library), "s");
  expect(pool).toHaveLength(15);
  expect(pool.slice(1, 6)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  expect(pool.slice(6)).toEqual(["vc", "vd", "ve", "vf", "wc", "wd", "we", "wf", "xc"]);
});

test("an artist next to a close one outranks a weakly linked close one", () => {
  const l = listeningOf(
    {
      s: [
        ["strong", 10],
        ["weak", 1],
      ],
      strong: [["friend", 10]],
    },
    ["s", "strong", "weak", "friend"],
  );
  expect(artistPool(l, "s")).toEqual(["s", "strong", "friend", "weak"]);
});
