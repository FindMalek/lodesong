import { expect, test } from "bun:test";
import { memoAsync } from "./memo-async";

test("the first call loads, later calls share it, and a failure is retried instead of cached", async () => {
  let calls = 0;
  const load = memoAsync(async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return calls;
  });
  await expect(load()).rejects.toThrow("boom");
  expect(await load()).toBe(2);
  expect(await load()).toBe(2);
  expect(calls).toBe(2);
});
