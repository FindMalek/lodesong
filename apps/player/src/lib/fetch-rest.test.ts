import { afterEach, expect, mock, test } from "bun:test";

// The toast and player modules need a browser to load; only the network boundary matters here.
mock.module("./notify", () => ({ notify: () => undefined }));
mock.module("./player", () => ({ player: {} }));
const { fetchRest, restRun } = await import("./fetch-rest");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub(added: string[], fail: { add?: string; status?: boolean }): void {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (String(url).endsWith("/add")) {
      if (body.input === fail.add) return Response.json({ error: "boom" }, { status: 500 });
      added.push(body.input);
      return Response.json({ recordingId: body.input, meta: {} });
    }
    if (fail.status) return Response.json({ error: "gone" }, { status: 500 });
    return Response.json({ status: "placed", stage: "placed" });
  }) as unknown as typeof fetch;
}

test("a run survives the page, stops on an error and resumes without re-adding", async () => {
  const added: string[] = [];
  const fail = { add: "two" as string | undefined };
  stub(added, fail);
  const items = ["one", "two", "three"].map((query) => ({ key: query, query }));

  const first = fetchRest("mb-1", items);
  await fetchRest("mb-1", items);
  await first;
  expect(restRun("mb-1").running).toBe(false);
  expect(restRun("mb-1").error).toContain("stopped after 1 of 3");
  expect([...restRun("mb-1").added]).toEqual(["one"]);

  fail.add = undefined;
  await fetchRest("mb-1", items);
  expect(added).toEqual(["one", "two", "three"]);
  expect(restRun("mb-1")).toMatchObject({ finished: true, placed: 3, error: null });
});

test("a track whose status check fails is not added again on retry", async () => {
  const added: string[] = [];
  const fail = { status: true };
  stub(added, fail);
  const items = ["a", "b"].map((query) => ({ key: query, query }));
  await fetchRest("mb-2", items);
  expect(restRun("mb-2").error).toContain("stopped after 1 of 2");
  fail.status = false;
  await fetchRest("mb-2", items);
  expect(added).toEqual(["a", "b"]);
});

test("a long album is requested in one hour's worth and finishes on the next run", async () => {
  const added: string[] = [];
  stub(added, {});
  const items = Array.from({ length: 31 }, (_, n) => ({ key: `t${n}`, query: `t${n}` }));
  await fetchRest("mb-3", items);
  expect(added).toHaveLength(30);
  expect(restRun("mb-3").finished).toBe(false);
  await fetchRest("mb-3", items);
  expect(added).toHaveLength(31);
  expect(restRun("mb-3").finished).toBe(true);
});
