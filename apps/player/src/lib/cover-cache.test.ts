import { afterEach, expect, spyOn, test } from "bun:test";
import { coverResponse } from "./cover-cache";

const fetcher = spyOn(globalThis, "fetch");
afterEach(() => fetcher.mockRestore());

test("answers before the cache is written, and trims only now and then", async () => {
  fetcher.mockImplementation((async () => new Response("art")) as unknown as typeof fetch);
  const keys: Request[] = Array.from({ length: 20 }, (_, i) => new Request(`http://x/cover/old${i}`));
  let listed = 0;
  let write = () => {};
  const written = new Promise<void>((resolve) => {
    write = resolve;
  });
  const cache = {
    match: async () => undefined,
    put: async (request: Request) => {
      await written;
      keys.push(request);
    },
    keys: async () => {
      listed++;
      return [...keys];
    },
    delete: async (request: Request) => keys.splice(keys.indexOf(request), 1).length > 0,
  } as unknown as Cache;
  const work: Promise<unknown>[] = [];

  const get = (id: string) => coverResponse(cache, new Request(`http://x/cover/${id}`), (job) => work.push(job), 10);
  expect(await (await get("a")).text()).toBe("art");
  await get("b");
  write();
  await Promise.all(work);

  expect(listed).toBe(1);
  expect(keys.length).toBe(9);
});
