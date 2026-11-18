import { expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const sessions = new SessionStore(":memory:", "secret", 60_000);
const admin = sessions.create({ server: "default", user: "boss", token: "t", salt: "s", agent: "", admin: true });
const guest = sessions.create({ server: "default", user: "guest", token: "t", salt: "s", agent: "", admin: false });

function build(answer: Response | null, publicDemo = false) {
  const seen: { url: string; headers: Headers; body: string }[] = [];
  const api = createApi({
    upstreams: [],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    publicDemo,
    lyterion: { url: "http://lyterion", token: "secret" },
    fetcher: (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: new Headers(init.headers), body: String(init.body) });
      if (!answer) throw new Error("down");
      return answer.clone();
    }) as unknown as typeof fetch,
  });
  return { api, seen };
}

const post = (step: string, session: string, body: unknown) =>
  Object.assign(
    new Request(`http://app/api/wishlist/${step}`, {
      method: "POST",
      headers: { cookie: `kp_session=${session}`, "x-lodesong": "1" },
      body: JSON.stringify(body),
    }),
    { params: { step } },
  );

test("any signed-in user adds songs, the public demo can't, and the token never leaves the server", async () => {
  const { api, seen } = build(Response.json({ title: "Widows Weep" }));
  expect((await api.wishlist(post("add", "nope", { input: "shyler widows weep" }))).status).toBe(401);
  expect(seen).toHaveLength(0);
  expect((await api.wishlist(post("add", guest, { input: "shyler widows weep" }))).status).toBe(200);
  seen.length = 0;
  const demo = build(Response.json({}), true);
  for (const step of ["add", "search", "preview"])
    expect((await demo.api.wishlist(post(step, guest, { input: "shyler widows weep" }))).status).toBe(403);
  expect(demo.seen).toHaveLength(0);
  const response = await api.wishlist(post("preview", admin, { input: " shyler widows weep " }));
  expect(await response.json()).toEqual({ title: "Widows Weep", cover: null });
  expect(seen[0]?.url).toBe("http://lyterion/api/rpc/api-reference/player/wishlist/preview");
  expect(seen[0]?.headers.get("x-lyterion-token")).toBe("secret");
  expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ input: "shyler widows weep" });
});

test("a name search returns candidates with covers inlined from known hosts only", async () => {
  const { api, seen } = build(
    Response.json({
      candidates: [{ title: "Teardrop", input: "https://www.deezer.com/track/7", coverUrl: "https://evil.example/x.jpg" }],
      unreachable: ["youtube"],
    }),
  );
  const response = await api.wishlist(post("search", admin, { input: "teardrop" }));
  expect(await response.json()).toEqual({
    candidates: [{ title: "Teardrop", input: "https://www.deezer.com/track/7", cover: null }],
    unreachable: ["youtube"],
  });
  expect(seen[0]?.url).toBe("http://lyterion/api/rpc/api-reference/player/wishlist/search");
});

test("lyterion's reason comes through, and a busy run is a conflict", async () => {
  const busy = build(Response.json({ message: "a run is already in progress" }, { status: 412 }));
  const response = await busy.api.wishlist(post("add", admin, { input: "ty saint laurent" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "a run is already in progress" });
  expect((await build(null).api.wishlist(post("status", admin, { recordingId: "wish-1" }))).status).toBe(502);
});

test("a preview cover is inlined only from known image hosts", async () => {
  const seen: string[] = [];
  const api = createApi({
    upstreams: [],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    lyterion: { url: "http://lyterion", token: "secret" },
    fetcher: (async (url: string | URL) => {
      seen.push(String(url));
      if (String(url).startsWith("http://lyterion")) return Response.json({ title: "t", coverUrl: nextCover });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch,
  });
  let nextCover = "https://i.ytimg.com/vi/x/mqdefault.jpg";
  expect(await (await api.wishlist(post("preview", admin, { input: "x y" }))).json()).toEqual({
    title: "t",
    cover: "data:image/jpeg;base64,AQID",
  });
  nextCover = "https://internal.example/secret.jpg";
  seen.length = 0;
  expect(((await (await api.wishlist(post("preview", admin, { input: "x y" }))).json()) as { cover: unknown }).cover).toBeNull();
  expect(seen).toEqual(["http://lyterion/api/rpc/api-reference/player/wishlist/preview"]);
});

test("an unknown step is a 404 and never reaches lyterion", async () => {
  const { api, seen } = build(Response.json({}));
  for (const step of ["constructor", "toString", "nope"])
    expect((await api.wishlist(post(step, admin, { input: "shyler widows weep" }))).status).toBe(404);
  expect(seen).toHaveLength(0);
});

test("searches are counted per account, so a new session doesn't reset them", async () => {
  const { api, seen } = build(Response.json({ candidates: [] }));
  const again = sessions.create({ server: "default", user: "Boss", token: "t", salt: "s", agent: "", admin: true });
  for (let i = 0; i < 120; i++) await api.wishlist(post("search", i % 2 ? admin : again, { input: "teardrop" }));
  expect((await api.wishlist(post("search", again, { input: "teardrop" }))).status).toBe(429);
  expect(seen).toHaveLength(120);
});

test("search covers are inlined, and a big one is dropped by the smaller search cap", async () => {
  const sizes: Record<string, number> = { "https://i.ytimg.com/small.jpg": 1_000, "https://i.ytimg.com/big.jpg": 50_000 };
  const api = createApi({
    upstreams: [],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    lyterion: { url: "http://lyterion", token: "secret" },
    fetcher: (async (url: string | URL) =>
      String(url).startsWith("http://lyterion")
        ? Response.json({ candidates: Object.keys(sizes).map((coverUrl) => ({ title: "t", coverUrl })) })
        : new Response(new Uint8Array(sizes[String(url)] ?? 0), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch,
  });
  const { candidates } = (await (await api.wishlist(post("search", admin, { input: "teardrop" }))).json()) as {
    candidates: { cover: string | null }[];
  };
  expect(candidates[0]?.cover).toStartWith("data:image/jpeg;base64,");
  expect(candidates[1]?.cover).toBeNull();
});
