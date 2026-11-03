import { afterAll, expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const navidrome = Bun.serve({
  port: 0,
  fetch: (request) => {
    const endpoint = new URL(request.url).pathname;
    return Response.json({
      "subsonic-response": { status: "ok", ...(endpoint.includes("getUser") ? { user: { adminRole: true } } : {}) },
    });
  },
});
afterAll(() => navidrome.stop());

const apiWith = (publicDemo: boolean) =>
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
