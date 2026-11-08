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

test("a cover that throws on its frame doesn't skip the covers after it", () => {
  let tick = () => {};
  spyOn(globalThis, "setInterval").mockImplementation(((run: () => void) => {
    tick = run;
    return 1;
  }) as unknown as typeof setInterval);
  const report = spyOn(globalThis, "reportError").mockImplementation(() => {});
  let painted = 0;
  const stopBad = onDriftFrame(() => {
    throw new Error("canvas lost");
  });
  const stopGood = onDriftFrame(() => (painted += 1));
  tick();
  expect(painted).toBe(1);
  expect(report).toHaveBeenCalledTimes(1);
  stopBad();
  stopGood();
  report.mockRestore();
});
