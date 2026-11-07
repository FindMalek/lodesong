import { expect, test } from "bun:test";
import { ditherCells, ditherPath, ditherSeed } from "./dither";

const fill = (cells: Uint8Array) => cells.reduce((sum, cell) => sum + cell, 0) / cells.length;

test("a seed gives the same dither every time and another seed another one", () => {
  const first = ditherCells(32, 32, ditherSeed("mix-1"));
  expect(ditherCells(32, 32, ditherSeed("mix-1"))).toEqual(first);
  expect(ditherCells(32, 32, ditherSeed("mix-2"))).not.toEqual(first);
});

test("every seed leaves some cells on and some off", () => {
  for (const name of ["a", "mix-1", "mix-2", "daily mix 3", "x".repeat(40)]) {
    const share = fill(ditherCells(48, 48, ditherSeed(name)));
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.9);
  }
});

test("time moves the glow", () => {
  const seed = ditherSeed("mix-1");
  expect(ditherCells(32, 32, seed, 10)).not.toEqual(ditherCells(32, 32, seed, 0));
});

test("the path covers exactly the on cells of a real frame", () => {
  const cols = 24;
  const rows = 14;
  const cells = ditherCells(cols, rows, ditherSeed("mix-1"), 3);
  const drawn = new Uint8Array(cells.length);
  for (const [, x, y, width] of ditherPath(cells, cols, 5).matchAll(/M(\d+) (\d+)h(\d+)v5h-\d+z/g)) {
    for (let col = Number(x) / 5; col < (Number(x) + Number(width)) / 5; col += 1) drawn[(Number(y) / 5) * cols + col] = 1;
  }
  expect(ditherPath(new Uint8Array([1, 1, 1, 0, 1, 1]), 3, 2)).toBe("M0 0h6v2h-6zM2 2h4v2h-4z");
  expect(fill(cells)).toBeGreaterThan(0);
  expect([...drawn]).toEqual([...cells]);
  expect(ditherPath(cells, cols, 5).match(/z/g)?.length).toBeLessThan(fill(cells) * cells.length);
});
