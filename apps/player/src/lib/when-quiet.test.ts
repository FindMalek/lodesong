import { expect, test } from "bun:test";
import { whenQuiet } from "./when-quiet";

test("warm-ups wait for a few quiet seconds, run early on the first tap, and run once", async () => {
  const target = new EventTarget();
  let runs = 0;
  whenQuiet(() => (runs += 1), 60, target);
  await Bun.sleep(20);
  expect(runs).toBe(0);
  target.dispatchEvent(new Event("pointerdown"));
  await Bun.sleep(20);
  expect(runs).toBe(1);
  target.dispatchEvent(new Event("keydown"));
  await Bun.sleep(100);
  expect(runs).toBe(1);
});

test("warm-ups start on their own after the delay, and not at all once cancelled", async () => {
  const target = new EventTarget();
  let runs = 0;
  whenQuiet(() => (runs += 1), 30, target);
  const cancel = whenQuiet(() => (runs += 10), 30, target);
  cancel();
  await Bun.sleep(100);
  expect(runs).toBe(1);
});
