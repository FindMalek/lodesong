import { expect, test } from "bun:test";
import { RateLimit } from "./share-limit";

test("allows `max` events a window per key, then says how long to wait", () => {
  let now = 0;
  const limit = new RateLimit(3, 60_000, () => now);
  expect([limit.take("a"), limit.take("a"), limit.take("a")]).toEqual([0, 0, 0]);
  now = 20_000;
  expect(limit.take("a")).toBe(40);
  expect(limit.take("b")).toBe(0);
  now = 59_999;
  expect(limit.take("a")).toBe(1);
  now = 60_000;
  expect([limit.take("a"), limit.take("a"), limit.take("a")]).toEqual([0, 0, 0]);
  expect(limit.take("a")).toBeGreaterThan(0);
});

test("a refused event is not counted against the window", () => {
  let now = 0;
  const limit = new RateLimit(1, 1000, () => now);
  limit.take("a");
  for (let index = 0; index < 10; index++) limit.take("a");
  now = 1000;
  expect(limit.take("a")).toBe(0);
});
