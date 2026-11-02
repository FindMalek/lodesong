import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { FollowSync } from "./follow-sync";
import { listFollows, setFollow } from "./releases";

const lyterion = { url: "http://lyterion", token: "t".repeat(24) };

test("spotify artists are followed once a day, never touching what you chose here", async () => {
  const db = openLibraryDb(":memory:");
  setFollow(db, "s:u", "Tool", "pinned");
  setFollow(db, "s:u", "Hurt", "unfollowed");
  setFollow(db, "s:u", "Opeth", "followed");
  let calls = 0;
  const tokens: (string | null)[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls += 1;
    tokens.push(new Headers(init.headers).get("x-lyterion-token"));
    expect(url).toBe("http://lyterion/api/rpc/api-reference/player/followed-artists");
    return Response.json({
      artists: [{ id: "1", name: "Tool" }, { name: "hurt" }, { name: "Sleep Token" }, { name: "sleep token" }, { name: " " }],
    });
  }) as unknown as typeof fetch;
  const sync = new FollowSync(db, lyterion, () => ["s:u"], fetcher);

  await sync.runDue(Date.now());
  expect(tokens).toEqual([lyterion.token]);
  expect(listFollows(db, "s:u")).toEqual([
    { name: "Tool", status: "pinned" },
    { name: "Opeth", status: "followed" },
    { name: "Sleep Token", status: "followed" },
  ]);
  await sync.runDue(Date.now() + 3_600_000);
  expect(calls).toBe(1);
  expect(await sync.sync("s:u")).toEqual({ added: 0, total: 4 });
});

test("a lyterion that does not answer follows nothing and is asked again", async () => {
  const db = openLibraryDb(":memory:");
  const down = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  const sync = new FollowSync(db, lyterion, () => ["s:u"], down);
  await sync.runDue(Date.now());
  expect(await sync.sync("s:u")).toBeNull();
  expect(listFollows(db, "s:u")).toEqual([]);
  expect(db.query("select 1 from meta where key = 'follow-sync-last-run'").get()).toBeNull();
});
