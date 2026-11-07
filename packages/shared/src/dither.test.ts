import { expect, test } from "bun:test";
import { ditherCells, ditherPath, ditherSeed } from "./dither";

test("a seed gives the same dither, another seed another one, and it is neither empty nor full", () => {
  const first = ditherCells(32, 32, ditherSeed("mix-1"));
  expect(ditherCells(32, 32, ditherSeed("mix-1"))).toEqual(first);
  expect(ditherCells(32, 32, ditherSeed("mix-2"))).not.toEqual(first);
  const on = first.reduce((sum, cell) => sum + cell, 0);
  expect(on).toBeGreaterThan(32 * 32 * 0.1);
  expect(on).toBeLessThan(32 * 32 * 0.9);
});

test("time moves the glow and the path covers exactly the on cells", () => {
  const seed = ditherSeed("mix-1");
  expect(ditherCells(32, 32, seed, 10)).not.toEqual(ditherCells(32, 32, seed, 0));
  const cells = new Uint8Array([1, 1, 0, 1]);
  expect(ditherPath(cells, 2, 5)).toBe("M0 0h10v5h-10zM5 5h5v5h-5z");
});
