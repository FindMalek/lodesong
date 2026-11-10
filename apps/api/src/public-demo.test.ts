import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { type ApiOptions, createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const navidrome = Bun.serve({
  port: 0,
  fetch: (request) => {
    const url = new URL(request.url);
    const right =
      url.searchParams.get("t") ===
      createHash("md5")
        .update(`demo${url.searchParams.get("s")}`)
        .digest("hex");
    if (!right) return Response.json({ "subsonic-response": { status: "failed", error: { code: 40, message: "wrong" } } });
    return Response.json({
      "subsonic-response": { status: "ok", ...(url.pathname.includes("getUser") ? { user: { adminRole: true } } : {}) },
    });
  },
});
afterAll(() => navidrome.stop());

const apiWith = (publicDemo: boolean, demoAccount: { user: string; password: string } | null = null, extra: Partial<ApiOptions> = {}) =>
  createApi({
    upstreams: [{ id: "home", url: `http://127.0.0.1:${navidrome.port}` }],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions: new SessionStore(":memory:", "secret", 60_000),
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    publicDemo,
    demoAccount,
    ...extra,
  });

async function visit(publicDemo: boolean) {
  const api = apiWith(publicDemo);
  const server = { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<typeof api.login>[1];
  const login = await api.login(
    new Request("http://app/auth/login", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user: "demo", password: "demo", server: "home" }),
    }),
    server,
  );
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { cookie, "x-lodesong": "1" };
  const session = (await (await api.current(new Request("http://app/auth/session", { headers }))).json()) as { admin?: boolean };
  const token = await api.apiToken(new Request("http://app/auth/api-token", { method: "POST", headers }));
  const remove = await api.proxy(new Request("http://app/rest/deletePlaylist?id=1", { headers }));
  return { admin: session.admin, token: token.status, remove: remove.status };
}

test("the public demo has no admins, no tokens and no playlist deletes; a normal server keeps them", async () => {
  expect(await visit(true)).toEqual({ admin: false, token: 403, remove: 403 });
  expect(await visit(false)).toEqual({ admin: true, token: 200, remove: 200 });
});

const DEMO = { user: "demo", password: "demo" };
type Api = ReturnType<typeof apiWith>;
const socket = { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<Api["login"]>[1];
const enter = (api: Api, headers: Record<string, string> = {}) =>
  api.demoLogin(new Request("http://app/auth/demo", { method: "POST", headers: { "x-lodesong": "1", ...headers } }), socket);
const cookieOf = (response: Response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";

test("the demo signs a visitor in without a password, and only when it is a public demo", async () => {
  const demo = apiWith(true, DEMO);
  const on = await enter(demo);
  expect(on.status).toBe(200);
  expect(await on.json()).toMatchObject({ user: "demo" });
  const session = (await (await demo.current(new Request("http://app/auth/session", { headers: { cookie: cookieOf(on) } }))).json()) as {
    admin?: boolean;
  };
  expect(session.admin).toBe(false);

  const bare = await demo.demoLogin(new Request("http://app/auth/demo", { method: "POST" }), socket);
  expect(bare.status).toBe(403);
  for (const api of [apiWith(false, DEMO), apiWith(true)]) {
    const off = await enter(api);
    expect(off.status).toBe(404);
    expect(off.headers.get("set-cookie")).toBeNull();
  }
});

test("wrong passwords can't lock the demo's visitors out", async () => {
  const demo = apiWith(true, DEMO);
  for (let i = 0; i < 6; i++) {
    const guess = await demo.login(
      new Request("http://app/auth/login", {
        method: "POST",
        headers: { "x-lodesong": "1", "content-type": "application/json" },
        body: JSON.stringify({ user: "demo", password: "nope", server: "home" }),
      }),
      socket,
    );
    expect(guess.status).toBe(403);
  }
  expect((await enter(demo)).status).toBe(200);

  // Even a demo whose own password is wrong never turns into a 429 for everyone.
  const broken = apiWith(true, { user: "demo", password: "wrong" });
  for (let i = 0; i < 6; i++) expect((await enter(broken)).status).toBe(401);
});

test("sign-ins are counted by the address the proxy appended, per address and in all", async () => {
  const demo = apiWith(true, DEMO, { trustProxy: true });
  const from = (chain: string) => enter(demo, { "x-forwarded-for": chain });
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await from(`spoof-${i}, 10.0.0.1`)).status);
  expect(statuses.filter((status) => status === 200)).toHaveLength(30);
  expect(statuses[30]).toBe(429);

  let refused = 0;
  for (let i = 0; i < 300; i++) if ((await from(`10.1.${Math.floor(i / 250)}.${i % 250}`)).status === 429) refused += 1;
  expect(refused).toBeGreaterThan(0);
});

test("the demo keeps a bounded number of sessions, and visitors can't see or end each other's", async () => {
  const demo = apiWith(true, DEMO, { demoSessions: 2 });
  const first = cookieOf(await enter(demo));
  const second = cookieOf(await enter(demo));
  const third = cookieOf(await enter(demo));
  const as = (cookie: string, path: string, method = "GET") =>
    new Request(`http://app${path}`, { method, headers: { cookie, "x-lodesong": "1" } }) as Request & { params: { id: string } };
  expect((await demo.current(as(first, "/auth/session"))).status).toBe(401);
  expect((await demo.current(as(second, "/auth/session"))).status).toBe(200);

  const mine = (await (await demo.listSessions(as(third, "/auth/sessions"))).json()) as { current: string; sessions: { id: string }[] };
  expect(mine.sessions.map((item) => item.id)).toEqual([mine.current]);

  const other = (await (await demo.listSessions(as(second, "/auth/sessions"))).json()) as { current: string };
  const revoke = as(third, `/auth/sessions/${other.current}`, "DELETE");
  revoke.params = { id: other.current };
  expect((await demo.revokeSession(revoke)).status).toBe(403);
  expect((await demo.current(as(second, "/auth/session"))).status).toBe(200);
});
