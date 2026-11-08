import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mayWarm, whenQuiet } from "./when-quiet";

const scope = globalThis as { requestIdleCallback?: unknown };

beforeEach(() => {
  scope.requestIdleCallback = (run: () => void) => setTimeout(run, 0);
});

afterEach(() => {
  scope.requestIdleCallback = undefined;
});

test("steps run one after another, each after a quiet spell, and taps and keys push them back", async () => {
  const target = new EventTarget();
  const ran: number[] = [];
  whenQuiet([() => ran.push(1), () => ran.push(2)], 100, target);
  await Bun.sleep(60);
  target.dispatchEvent(new Event("pointerdown"));
  await Bun.sleep(80);
  expect(ran).toEqual([]);
  await Bun.sleep(100);
  expect(ran).toEqual([1]);
  await Bun.sleep(150);
  expect(ran).toEqual([1, 2]);
});

test("a tap never starts a step by itself, and a cancelled warm-up never runs", async () => {
  const target = new EventTarget();
  let runs = 0;
  whenQuiet([() => (runs += 1)], 50, target);
  const cancel = whenQuiet([() => (runs += 10)], 50, target);
  target.dispatchEvent(new Event("keydown"));
  expect(runs).toBe(0);
  cancel();
  await Bun.sleep(200);
  expect(runs).toBe(1);
});

test("data saver and 2g links get no warm-up", () => {
  expect(mayWarm({})).toBe(true);
  expect(mayWarm({ effectiveType: "4g" })).toBe(true);
  expect(mayWarm({ saveData: true })).toBe(false);
  expect(mayWarm({ effectiveType: "2g" })).toBe(false);
});

test("without requestIdleCallback (Safari) the step waits a second more instead of landing in the same task", async () => {
  scope.requestIdleCallback = undefined;
  const wait = spyOn(globalThis, "setTimeout");
  const target = new EventTarget();
  let runs = 0;
  const cancel = whenQuiet([() => (runs += 1)], 10, target);
  await Bun.sleep(60);
  expect(runs).toBe(0);
  expect(wait.mock.calls.some(([, ms]) => ms === 1000)).toBe(true);
  cancel();
  wait.mockRestore();
});

test("a tap while the browser is about to run a step cancels that step", async () => {
  scope.requestIdleCallback = (run: () => void) => setTimeout(run, 100);
  const target = new EventTarget();
  let runs = 0;
  whenQuiet([() => (runs += 1)], 50, target);
  await Bun.sleep(80);
  target.dispatchEvent(new Event("pointerdown"));
  await Bun.sleep(110);
  expect(runs).toBe(0);
  await Bun.sleep(150);
  expect(runs).toBe(1);
});
