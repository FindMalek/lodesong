import { afterAll, expect, setSystemTime, test } from "bun:test";
import { createKeepClient } from "@lodesong/orpc/client";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { createIndexTables } from "./search-index";
import { SessionStore } from "./sessions";

const upstream = Bun.serve({ port: 0, fetch: () => Response.json({ "subsonic-response": { status: "ok" } }) });
afterAll(() => upstream.stop());

const sessions = new SessionStore(":memory:", "secret", 60_000);
const api = createApi({
  upstreams: [{ id: "default", url: `http://127.0.0.1:${upstream.port}` }],
  indexes: new Map(),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
});
const cookie = sessions.create({ server: "default", user: "demo", token: "t", salt: "s", agent: "" });
const client = (headers: Record<string, string>) => createKeepClient("http://app/api/rpc", headers, (request) => api.rpc(request));

test("the typed client reaches the procedures signed in, is turned away signed out, and bad input never runs", async () => {
  const signedIn = client({ "x-lodesong": "1", cookie: `kp_session=${cookie}` });
  expect(await signedIn.stats.forgotten({ days: 30 })).toEqual({ songs: [] });
  const today = Math.floor(Date.now() / 86_400_000);
  expect(await signedIn.mixes({ day: today, hour: 9, tz: 0 })).toEqual({ day: today, mixes: [] });
  expect((await signedIn.mixes({ day: 9_000_000, hour: 9, tz: 0 })).day).toBe(today);

  await expect(client({ "x-lodesong": "1" }).stats.forgotten({ days: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(signedIn.stats.range({ from: 2, to: 1, tz: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  // Without the CSRF header the route answers 403 before oRPC sees it.
  await expect(client({ cookie: `kp_session=${cookie}` }).stats.forgotten({ days: 30 })).rejects.toBeDefined();
});

test("over plain HTTP: a bearer token signs in, a cookie needs the CSRF header, the spec lists the procedures", async () => {
  const token = sessions.create({ server: "default", user: "demo", token: "t", salt: "s", agent: "integration" });
  const call = (path: string, headers: Record<string, string> = {}) => api.http(new Request(`http://app${path}`, { headers }));

  const withToken = await call("/api/stats/forgotten?days=30", { authorization: `Bearer ${token}` });
  expect(withToken.status).toBe(200);
  expect(await withToken.json()).toEqual({ songs: [] });
  expect((await call("/api/stats/forgotten", { cookie: `kp_session=${cookie}` })).status).toBe(401);
  expect((await call("/api/stats/forgotten", { cookie: `kp_session=${cookie}`, "x-lodesong": "1" })).status).toBe(200);

  const spec = (await (await call("/api/spec.json")).json()) as { paths: Record<string, unknown> };
  expect(Object.keys(spec.paths)).toContain("/artists/{id}/appears-on");
});

test("the terminal's token only reaches what's playing; an api token made in settings reaches the api", async () => {
  const mint = async (make: (request: Request) => Response) => {
    const request = new Request("http://app/token", { method: "POST", headers: { "x-lodesong": "1", cookie: `kp_session=${cookie}` } });
    return ((await make(request).json()) as { token: string }).token;
  };
  const stats = (token: string) =>
    api.http(new Request("http://app/api/stats/forgotten", { headers: { authorization: `Bearer ${token}` } }));

  expect((await stats(await mint(api.remoteToken))).status).toBe(401);
  expect((await stats(await mint(api.apiToken))).status).toBe(200);
});

test("neither token counts as the browser cookie", async () => {
  const mint = async (make: (request: Request) => Response) => {
    const request = new Request("http://app/token", { method: "POST", headers: { "x-lodesong": "1", cookie: `kp_session=${cookie}` } });
    return ((await make(request).json()) as { token: string }).token;
  };
  for (const token of [await mint(api.remoteToken), await mint(api.apiToken)]) {
    const headers = { "x-lodesong": "1", cookie: `kp_session=${token}` };
    await expect(client(headers).stats.forgotten({ days: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(api.apiToken(new Request("http://app/token", { method: "POST", headers })).status).toBe(401);
  }
});

test("an integration lifts a radio ban with the song id in the path", async () => {
  const headers = { "x-lodesong": "1", cookie: `kp_session=${cookie}`, "content-type": "application/json" };
  const call = (method: string, path: string, body?: unknown) =>
    api.http(new Request(`http://app${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  await call("POST", "/api/radio/bans", { song: { id: "so-1", title: "one" } });
  const lifted = await call("DELETE", "/api/radio/bans/so-1");
  expect(lifted.status).toBe(200);
  expect(await lifted.json()).toEqual({ songs: [] });
});

const DAY_MS = 86_400_000;

/** A library of 100 Hurt songs played in the morning, a fake navidrome whose likes `answer` decides, and a client per user. */
function withNavidrome(answer: (user: string, calls: number) => Response | Promise<Response>, users = ["demo"]) {
  let calls = 0;
  const navidrome = Bun.serve({
    port: 0,
    idleTimeout: 30,
    fetch: (request) => answer(new URL(request.url).searchParams.get("u") ?? "", ++calls),
  });
  const library = openLibraryDb(":memory:");
  createIndexTables(library);
  const now = Date.now();
  const morning = now - (now % DAY_MS) + 9 * 3_600_000 - DAY_MS;
  for (let i = 0; i < 100; i++) {
    const item = { id: `Hurt-${i}`, artist: "Hurt", title: `Hurt ${i}` };
    library
      .query(
        "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('default', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
      )
      .run(item.id, JSON.stringify(item));
    for (const user of users)
      recordPlay(library, `default:${user}`, "", {
        song: item,
        started: morning - (i < 50 ? 3 : 60) * DAY_MS,
        listened: 200,
        finished: true,
      });
  }
  const own = new SessionStore(":memory:", "secret", 10 * DAY_MS);
  const made = createApi({
    upstreams: [{ id: "default", url: `http://127.0.0.1:${navidrome.port}` }],
    indexes: new Map(),
    library,
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions: own,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
  });
  const client = (user: string) => {
    const session = own.create({ server: "default", user, token: "t", salt: "s", agent: "" });
    const rpc = createKeepClient("http://app/api/rpc", { "x-lodesong": "1", cookie: `kp_session=${session}` }, (request) =>
      made.rpc(request),
    );
    return () => rpc.mixes({ day: Math.floor(Date.now() / DAY_MS), hour: 9, tz: 0 });
  };
  const stored = () => library.query<{ n: number }, []>("select count(*) as n from mix_days").get()?.n;
  return { client, stored, calls: () => calls, stop: () => navidrome.stop(true) };
}

const starred = (...ids: unknown[]) => Response.json({ "subsonic-response": { status: "ok", starred2: { song: ids } } });
const likes = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ id: `Hurt-${from + i}` }));
const idsOf = (result: { mixes: { id: string; songs: { id: string }[] }[] }, mix: string) =>
  result.mixes.find((item) => item.id === mix)?.songs.map((item) => item.id) ?? [];

test("the songs you like in navidrome lead your daily mix", async () => {
  const liked = likes(0, 50);
  const navidrome = withNavidrome(() => starred(...liked));
  const mixes = navidrome.client("demo");
  const daily = (await mixes()).mixes.find((mix) => mix.id === "daily-1");
  await mixes();
  expect(navidrome.calls()).toBe(1);
  expect(daily?.songs).toHaveLength(50);
  expect(daily?.songs.every((item) => liked.some((like) => like.id === item.id))).toBe(true);
  navidrome.stop();
});

test("a day made while navidrome's likes failed isn't kept, so the likes lead it once they are back", async () => {
  const navidrome = withNavidrome((_, calls) => (calls === 1 ? new Response("down", { status: 500 }) : starred(...likes(0, 50))));
  const mixes = navidrome.client("demo");
  const first = await mixes();
  expect(idsOf(first, "daily-1")).toHaveLength(50);
  expect(navidrome.stored()).toBe(0);
  await mixes();
  expect(navidrome.calls()).toBe(1);
  setSystemTime(Date.now() + 3 * 60_000);
  try {
    expect(idsOf(await mixes(), "daily-1").every((id) => Number(id.split("-")[1]) < 50)).toBe(true);
    expect(navidrome.stored()).toBeGreaterThan(0);
  } finally {
    setSystemTime();
  }
  navidrome.stop();
});

test("a hung navidrome holds the mixes for a couple of seconds, not for the whole upstream timeout", async () => {
  const navidrome = withNavidrome(() => new Promise<Response>(() => {}));
  const started = Date.now();
  expect(idsOf(await navidrome.client("demo")(), "daily-1")).toHaveLength(50);
  expect(Date.now() - started).toBeLessThan(4_000);
  navidrome.stop();
});

test("a malformed starred entry degrades to the entries that are fine", async () => {
  const navidrome = withNavidrome(() => starred(null, {}, { id: 5 }, "x", ...likes(0, 50)));
  const daily = idsOf(await navidrome.client("demo")(), "daily-1");
  expect(daily.every((id) => Number(id.split("-")[1]) < 50)).toBe(true);
  navidrome.stop();
});

test("a like added or removed shows in the next mixes, per account, and a failing navidrome keeps the last likes", async () => {
  let down = false;
  const answers: Record<string, ReturnType<typeof likes>> = { demo: likes(0, 40), other: likes(60, 100) };
  const navidrome = withNavidrome(
    (user) => (down ? new Response("down", { status: 500 }) : starred(...(answers[user] ?? []))),
    ["demo", "other"],
  );
  const [demo, other] = [navidrome.client("demo"), navidrome.client("other")];
  const daylist = async (mixes: typeof demo) => new Set(idsOf(await mixes(), "daylist"));
  const before = [await daylist(demo), await daylist(other)];
  expect([...(before[0] as Set<string>)].filter((id) => Number(id.split("-")[1]) < 40).length).toBeGreaterThan(30);
  expect([...(before[1] as Set<string>)].filter((id) => Number(id.split("-")[1]) >= 60).length).toBeGreaterThan(30);

  try {
    setSystemTime(Date.now() + 11 * 60_000);
    answers.demo = likes(60, 100);
    const after = await daylist(demo);
    expect([...after].filter((id) => Number(id.split("-")[1]) >= 60).length).toBeGreaterThan(30);

    setSystemTime(Date.now() + 11 * 60_000);
    down = true;
    expect(await daylist(demo)).toEqual(after);
  } finally {
    setSystemTime();
  }
  navidrome.stop();
});
