import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { throttle } from "./throttle";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("a burst runs once at once and once more with the latest value, never twice inside a window", () => {
  const seen: number[] = [];
  const send = throttle((value: number) => seen.push(value), 100);
  for (let i = 1; i <= 4; i++) {
    send(i);
    jest.advanceTimersByTime(20);
  }
  expect(seen).toEqual([1]);
  jest.advanceTimersByTime(100);
  expect(seen).toEqual([1, 4]);
  send(6);
  expect(seen).toEqual([1, 4]);
  jest.advanceTimersByTime(100);
  expect(seen).toEqual([1, 4, 6]);
  jest.advanceTimersByTime(100);
  send(7);
  expect(seen).toEqual([1, 4, 6, 7]);
});
