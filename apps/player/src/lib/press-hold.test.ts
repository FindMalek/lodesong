import { afterAll, beforeEach, expect, jest, test } from "bun:test";

const page = new EventTarget();
const doc = Object.assign(new EventTarget(), { hidden: false });
Object.assign(globalThis, { window: page, document: doc });

const { pressHeld, whenPressEnds } = await import("./press-hold");

let ended = 0;
whenPressEnds(() => ended++);

function fire(type: string, init: object = {}): void {
  page.dispatchEvent(Object.assign(new Event(type), init));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllTimers();
  fire("pointercancel");
  jest.advanceTimersByTime(10);
  ended = 0;
});

test("a press is held until the click lands", () => {
  fire("pointerdown");
  expect(pressHeld()).toBe(true);
  fire("pointerup");
  jest.advanceTimersByTime(100);
  expect(pressHeld()).toBe(true);
  fire("click");
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
  expect(ended).toBe(1);
});

test("a press the browser cancels is let go", () => {
  fire("pointerdown");
  fire("pointercancel");
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
});

test("a press that turns into a context menu is let go", () => {
  fire("pointerdown");
  fire("contextmenu");
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
});

test("a press that turns into a drag is let go", () => {
  fire("pointerdown");
  fire("dragend");
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
});

test("a press the window loses focus in is let go", () => {
  fire("pointerdown");
  fire("blur");
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
});

test("a press during which the tab is hidden is let go", () => {
  fire("pointerdown");
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.hidden = false;
  jest.advanceTimersByTime(1);
  expect(pressHeld()).toBe(false);
});

test("a press nothing ever releases is let go after a few seconds", () => {
  fire("pointerdown");
  jest.advanceTimersByTime(2400);
  expect(pressHeld()).toBe(true);
  jest.advanceTimersByTime(200);
  expect(pressHeld()).toBe(false);
  expect(ended).toBe(1);
});

test("space is held from keydown until keyup, since that is when a button acts", () => {
  fire("keydown", { key: " " });
  expect(pressHeld()).toBe(true);
  fire("keyup", { key: " " });
  jest.advanceTimersByTime(100);
  expect(pressHeld()).toBe(true);
  jest.advanceTimersByTime(400);
  expect(pressHeld()).toBe(false);
});

test("typing a letter holds nothing", () => {
  fire("keydown", { key: "a" });
  expect(pressHeld()).toBe(false);
});

afterAll(() => {
  jest.useRealTimers();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});
