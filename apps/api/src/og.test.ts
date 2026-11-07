import { afterAll, expect, test } from "bun:test";
import { greyPng } from "../../../test/mock/png";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const NAME = `"><script>alert(1)</script> & 'x'`;
const PNG = [137, 80, 78, 71];
let lookups = 0;
const navidrome = Bun.serve({
  port: 0,
  fetch: (request) => {
    const endpoint = new URL(request.url).pathname;
    if (endpoint.includes("getCoverArt")) return new Response(greyPng(64, 60), { headers: { "content-type": "image/png" } });
    lookups += 1;
    const album = { name: NAME, artist: "Orbit Hollow", year: 2019, songCount: 3, duration: 600, coverArt: "al-1" };
    return Response.json({ "subsonic-response": { status: "ok", ...(endpoint.includes("getAlbum") ? { album } : {}) } });
  },
});
afterAll(() => navidrome.stop());

const api = createApi({
  upstreams: [{ id: "home", url: `http://127.0.0.1:${navidrome.port}` }],
  indexes: new Map(),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions: new SessionStore(":memory:", "secret", 60_000),
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
  shareSecret: "secret",
});

const BOT = { "user-agent": "Slackbot-LinkExpanding 1.0" };
const withParams = <T extends object>(request: Request, params: T) => Object.assign(request, { params });
const page = (query = "", headers: Record<string, string> = BOT) =>
  api.shareHead(withParams(new Request(`https://music.example/album/al-1${query}`, { headers }), { id: "al-1" }), "album");
const image = (url: string, headers: Record<string, string> = BOT) => {
  const [, kind = "", file = ""] = /\/og\/([^/]+)\/([^?]+)/.exec(url) ?? [];
  return api.ogImage(withParams(new Request(url, { headers }), { kind, file }));
};

async function signIn(): Promise<string> {
  const login = await api.login(
    new Request("http://app/auth/login", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user: "demo", password: "demo", server: "home" }),
    }),
    { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<typeof api.login>[1],
  );
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function shareLink(cookie: string): Promise<string> {
  const response = await api.shareCreate(
    new Request("http://app/api/share", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json", cookie },
      body: JSON.stringify({ kind: "album", id: "al-1" }),
    }),
  );
  return ((await response.json()) as { path: string }).path;
}

test("a crawler gets the generic card without a signed link, the real album and a PNG with one", async () => {
  const bare = await page();
  expect(bare).toContain('property="og:title" content="lodesong"');
  expect(bare).toContain('content="https://music.example/og.png"');
  expect(bare).not.toContain("Orbit Hollow");
  expect((await image("https://music.example/og/album/al-1.png")).status).toBe(200);

  const cookie = await signIn();
  const path = await shareLink(cookie);
  const token = new URL(path, "https://music.example").searchParams.get("s") ?? "";
  const before = lookups;

  const shared = await page(`?s=${token}`);
  expect(shared).toContain("album · Orbit Hollow · 2019 · 3 songs · 10 min");
  expect(shared).toContain("&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#39;x&#39;");
  expect(shared).not.toContain("<script");
  expect(shared).not.toContain(token);
  expect(shared).not.toContain("og:url");

  const url = /content="(https:\/\/music\.example\/og\/album\/al-1\.png\?s=[^"]+)"/.exec(shared)?.[1] ?? "";
  const card = await image(url);
  expect(card.headers.get("content-type")).toBe("image/png");
  expect([...new Uint8Array(await card.arrayBuffer()).slice(0, 4)]).toEqual(PNG);
  expect(lookups).toBe(before);

  const generic = new Uint8Array(await (await image("https://music.example/og/album/al-1.png")).arrayBuffer());
  const real = new Uint8Array(await (await image(url)).arrayBuffer());
  expect(real.length).not.toBe(generic.length);
});

test("a tampered or borrowed token falls back to the generic card", async () => {
  const path = await shareLink(await signIn());
  const token = new URL(path, "https://music.example").searchParams.get("s") ?? "";
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  expect(await page(`?s=${tampered}`)).toContain('property="og:title" content="lodesong"');
  const other = api.shareHead(
    withParams(new Request(`https://music.example/album/al-2?s=${token}`, { headers: BOT }), { id: "al-2" }),
    "album",
  );
  expect(await other).toContain('property="og:title" content="lodesong"');
  expect(await page(`?s=${token}`, {})).toContain("3 songs");
});

test("a signed-in browser sees the real album without a token", async () => {
  const member = await page("", { cookie: await signIn() });
  expect(member).toContain("album · Orbit Hollow");
  expect(member).toContain("https://music.example/og/album/al-1.png");
});
