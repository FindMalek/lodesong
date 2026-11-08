import { afterEach, beforeEach, expect, jest, test } from "bun:test";

const writes: unknown[] = [];
let saved: unknown;
let reading: Promise<unknown> | null = null;
let removed = 0;

const disk = {
  set: async (_key: string, value: unknown) => {
    writes.push(value);
  },
  get: async () => (reading ? reading : saved),
  del: async () => {
    removed++;
  },
} as never;

let page = new EventTarget();
let doc = Object.assign(new EventTarget(), { hidden: false });

const { createSnapshotStore } = await import("./snapshot-store");

interface Snap {
  queue: string[];
}

let queue: string[] = [];
let playing = false;
let account = "a";

function make() {
  return createSnapshotStore<Snap>({
    key: "k",
    read: () => ({ queue }),
    empty: () => queue.length === 0,
    active: () => playing,
    account: () => account,
    disk,
  });
}

function hide(): void {
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.hidden = false;
}

afterEach(() => {
  jest.useRealTimers();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

beforeEach(() => {
  page = new EventTarget();
  doc = Object.assign(new EventTarget(), { hidden: false });
  Object.assign(globalThis, { window: page, document: doc });
  jest.useFakeTimers();
  jest.clearAllTimers();
  writes.length = 0;
  saved = undefined;
  reading = null;
  removed = 0;
  queue = ["x"];
  playing = false;
  account = "a";
});

test("the first change after a quiet spell is written at once", () => {
  make().persist(true);
  jest.advanceTimersByTime(1);
  expect(writes).toHaveLength(1);
});

test("a burst of queue changes is the first write and one more after the burst", () => {
  const store = make();
  for (let i = 0; i < 10; i++) {
    store.persist(true);
    jest.advanceTimersByTime(30);
  }
  expect(writes).toHaveLength(1);
  jest.advanceTimersByTime(80);
  expect(writes).toHaveLength(2);
});

test("a burst that never pauses still gets written within half a second", () => {
  const store = make();
  for (let i = 0; i < 40; i++) {
    store.persist(true);
    jest.advanceTimersByTime(30);
  }
  expect(writes.length).toBeGreaterThanOrEqual(2);
  expect(writes.length).toBeLessThanOrEqual(4);
});

test("a queue change that lands while an idle write waits is written once", () => {
  const store = make();
  store.persist();
  store.persist(true);
  jest.advanceTimersByTime(3000);
  expect(writes).toHaveLength(1);
});

test("hiding the tab right after a change writes it, and the pagehide after that adds nothing", () => {
  make().persist(true);
  hide();
  page.dispatchEvent(new Event("pagehide"));
  jest.advanceTimersByTime(1000);
  expect(writes).toHaveLength(1);
});

test("leaving the page writes a change that was still waiting for an idle moment", () => {
  make().persist();
  page.dispatchEvent(new Event("pagehide"));
  expect(writes).toHaveLength(1);
});

test("a tab that changed nothing leaves what another tab saved alone when it is hidden", () => {
  make();
  hide();
  page.dispatchEvent(new Event("pagehide"));
  expect(writes).toHaveLength(0);
});

test("the tab that is playing writes its position when hidden", () => {
  make();
  playing = true;
  jest.advanceTimersByTime(2000);
  hide();
  expect(writes).toHaveLength(1);
});

test("an empty queue is not written before the saved one is read back", async () => {
  queue = [];
  const store = make();
  store.persist(true);
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(0);
  await store.restore();
  store.persist(true);
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(1);
});

test("a queue cleared before the saved one is read back stays cleared", async () => {
  saved = { queue: ["old"] };
  const store = make();
  const restoring = store.restore();
  store.skipRestore();
  expect(await restoring).toBeNull();
});

test("a read that never settles stops blocking after a while", async () => {
  reading = new Promise(() => {});
  queue = [];
  const store = make();
  const restoring = store.restore();
  jest.advanceTimersByTime(3000);
  expect(await restoring).toBeNull();
  store.persist(true);
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(1);
});

test("a queue saved by another account is not restored", async () => {
  saved = { queue: ["theirs"], account: "b" };
  expect(await make().restore()).toBeNull();
});

test("a queue saved by this account is restored", async () => {
  saved = { queue: ["mine"], account: "a" };
  expect((await make().restore())?.queue).toEqual(["mine"]);
});

test("a tab left on the old account writes nothing after the account changed elsewhere", () => {
  const store = make();
  store.persist(true);
  account = "b";
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(0);
});

test("changing account drops the saved queue and the write that was waiting", async () => {
  const store = make();
  store.persist(true);
  account = "b";
  await store.forget();
  jest.advanceTimersByTime(200);
  expect(removed).toBe(1);
  expect(writes).toHaveLength(0);
});

test("after an account change the new account's changes are written", async () => {
  const store = make();
  account = "b";
  await store.forget();
  store.persist(true);
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(1);
});

test("an emptied queue is written even though the saved one is still being read", () => {
  reading = new Promise(() => {});
  queue = [];
  const store = make();
  void store.restore();
  store.skipRestore();
  store.persist(true);
  jest.advanceTimersByTime(200);
  expect(writes).toHaveLength(1);
});
