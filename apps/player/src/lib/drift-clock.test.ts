import { afterEach, expect, spyOn, test } from "bun:test";
import { onDriftFrame } from "./drift-clock";

afterEach(() => {
  spyOn(globalThis, "setInterval").mockRestore();
});

test("a page of covers shares one timer, which stops with the last of them", () => {
  const start = spyOn(globalThis, "setInterval");
  const stopA = onDriftFrame(() => {});
  const stopB = onDriftFrame(() => {});
  const stopC = onDriftFrame(() => {});
  expect(start).toHaveBeenCalledTimes(1);
  const clear = spyOn(globalThis, "clearInterval");
  stopA();
  stopB();
  expect(clear).not.toHaveBeenCalled();
  stopC();
  expect(clear).toHaveBeenCalledTimes(1);
  onDriftFrame(() => {})();
  expect(start).toHaveBeenCalledTimes(2);
});
