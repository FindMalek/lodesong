import { afterAll, expect, test } from "bun:test";
import { greyPng } from "../../../test/mock/png";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const NAME = `"><script>alert(1)</script> & 'x'`;
const JPEG = [0xff, 0xd8, 0xff];
const mock = { name: NAME, artist: "Orbit Hollow", coverFails: false, lookups: 0, coverUsers: [] as (string | null)[] };
const navidromeAt = (shade: number) =>
  Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      const user = url.searchParams.get("u");
      const id = url.searchParams.get("id") ?? "";
      if (url.pathname.includes("getCoverArt")) {
        mock.coverUsers.push(user);
        if (mock.coverFails) return new Response("down", { status: 500 });
        return new Response(greyPng(64, shade), { headers: { "content-type": "image/png" } });
      }
      mock.lookups += 1;
      const hidden = id === "al-priv" && user !== "alice";
      const album = {
        name: id.startsWith("al-q") ? `${mock.name} ${id}` : mock.name,
        artist: mock.artist,
        year: 2019,
        songCount: 3,
        duration: 600,
        coverArt: id === "al-cov" ? "cov-1" : "al-1",
      };
      const body = hidden || !url.pathname.includes("getAlbum") ? { status: hidden ? "failed" : "ok" } : { status: "ok", album };
      return Response.json({ "subsonic-response": body });
    },
  });
const navidrome = navidromeAt(60);
const away = navidromeAt(220);
afterAll(() => {
  navidrome.stop();
  away.stop();
});

function makeApi(extra: { publicDemo?: boolean; trustProxy?: boolean; publicUrl?: string; shareMax?: number } = {}) {
  return createApi({
    upstreams: [
      { id: "home", url: `http://127.0.0.1:${navidrome.port}` },
      { id: "away", url: `http://127.0.0.1:${away.port}` },
    ],
    indexes: new Map(),
    library: openLibraryDb(":memory:"),
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions: new SessionStore(":memory:", "secret", 60_000),
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    shareSecret: "secret",
    ...extra,
  });
}
const api = makeApi();

const BOT = { "user-agent": "Slackbot-LinkExpanding 1.0" };
const withParams = <T extends object>(request: Request, params: T) => Object.assign(request, { params });
const page = (query = "", headers: Record<string, string> = BOT, id = "al-1", site = api) =>
  site.shareHead(withParams(new Request(`https://music.example/album/${id}${query}`, { headers }), { id }), "album");
const image = (url: string, headers: Record<string, string> = BOT) => {
  const [, kind = "", file = ""] = /\/og\/([^/]+)\/([^?]+)/.exec(url) ?? [];
  return api.ogImage(withParams(new Request(url, { headers }), { kind, file }));
};
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer());
const imageUrl = (html: string) => /content="(https:\/\/music\.example\/og\/album\/[^"]+)"/.exec(html)?.[1] ?? "";

async function signIn(user = "alice", site = api, server = "home"): Promise<string> {
  const login = await site.login(
    new Request("http://app/auth/login", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user, password: "demo", server }),
    }),
    { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<typeof api.login>[1],
  );
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const post = (cookie: string, body: unknown, site = api) =>
  site.shareCreate(
    new Request("http://app/api/share", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );

async function shareLink(cookie: string, id = "al-1"): Promise<{ path: string; share: string; token: string }> {
  const created = (await (await post(cookie, { kind: "album", id })).json()) as { path: string; share: string };
  return { ...created, token: new URL(created.path, "https://music.example").searchParams.get("s") ?? "" };
}

const unshare = (cookie: string, share: string, headers: Record<string, string> = { "x-lodesong": "1" }) =>
  api.shareRemove(
    withParams(new Request(`http://app/api/share/${share}`, { method: "DELETE", headers: { ...headers, cookie } }), { id: share }),
  );

const mine = async (cookie: string) =>
  ((await (await api.shareList(new Request("http://app/api/share", { headers: { cookie } }))).json()) as { shares: { id: string }[] })
    .shares;

test("a crawler gets the generic card without a signed link, the real album and a JPEG with one", async () => {
  const bare = await page();
  expect(bare).toContain('property="og:title" content="lodesong"');
  expect(bare).toContain('content="https://music.example/og.jpg"');
  expect(bare).not.toContain("Orbit Hollow");
  expect((await image("https://music.example/og/album/al-1.jpg")).status).toBe(200);

  const { token } = await shareLink(await signIn());
  const before = mock.lookups;

  const shared = await page(`?s=${token}`);
  expect(shared).toContain("album · Orbit Hollow · 2019 · 3 songs · 10 min");
  expect(shared).toContain("&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#39;x&#39;");
  expect(shared).toContain('property="og:image:width" content="1200"');
  expect(shared).toContain('property="og:image:alt"');
  expect(shared).not.toContain("<script");
  expect(shared).not.toContain(token);
  expect(shared).not.toContain("og:url");

  const card = await image(imageUrl(shared));
  expect(card.headers.get("content-type")).toBe("image/jpeg");
  expect([...(await bytesOf(card)).slice(0, 3)]).toEqual(JPEG);
  expect(mock.lookups).toBe(before);

  const generic = await bytesOf(await image("https://music.example/og/album/al-1.jpg"));
  const real = await bytesOf(await image(imageUrl(shared)));
  expect(real.length).not.toBe(generic.length);
});

test("a tampered or borrowed token falls back to the generic card", async () => {
  const { token } = await shareLink(await signIn());
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  expect(await page(`?s=${tampered}`)).toContain('property="og:title" content="lodesong"');
  expect(await page(`?s=${token}`, BOT, "al-2")).toContain('property="og:title" content="lodesong"');
  expect(await page(`?s=${token}`, {})).toContain("3 songs");
});

test("a signed-in browser sees the real album without a token, and a forwarded host changes nothing", async () => {
  const member = await page("", { cookie: await signIn(), "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
  expect(member).toContain("album · Orbit Hollow");
  expect(member).toContain('content="https://music.example/og/album/al-1.jpg"');
  expect(member).toContain('content="https://music.example/album/al-1"');
});

test("image caching follows who asks: a member's stays private, a link's and the generic one are public", async () => {
  const cookie = await signIn();
  const { token } = await shareLink(cookie);
  const own = await image("https://music.example/og/album/al-1.jpg", { cookie });
  expect(own.headers.get("cache-control")).toBe("private, max-age=300");
  expect(own.headers.get("vary")).toBe("cookie");
  const linked = await image(imageUrl(await page(`?s=${token}`)));
  expect(linked.headers.get("cache-control")).toBe("public, max-age=3600");
  expect(linked.headers.get("vary")).toBe("cookie");
  const generic = await image("https://music.example/og/album/al-1.jpg");
  expect(generic.headers.get("cache-control")).toBe("public, max-age=86400");
  expect(generic.headers.get("vary")).toBe("cookie");
});

test("two members sharing one album keep their own snapshots and links", async () => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  mock.name = "First Name";
  const first = await shareLink(alice);
  mock.name = "Second Name";
  const second = await shareLink(bob);
  expect(second.share).not.toBe(first.share);
  expect(await page(`?s=${first.token}`)).toContain('property="og:title" content="First Name"');
  expect(await page(`?s=${second.token}`)).toContain('property="og:title" content="Second Name"');

  const again = await shareLink(alice);
  expect(again.share).toBe(first.share);
  expect(await page(`?s=${first.token}`)).toContain('property="og:title" content="Second Name"');
  expect(await page(`?s=${again.token}`)).toContain('property="og:title" content="Second Name"');
  expect(await mine(alice)).toHaveLength(1);
  mock.name = NAME;
});

test("unsharing ends every link made from the share, and only its owner can do it", async () => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  const first = await shareLink(alice, "al-2");
  const second = await shareLink(bob, "al-2");
  const html = () => page(`?s=${first.token}`, BOT, "al-2");

  expect(await html()).toContain("3 songs");
  expect((await unshare(bob, first.share)).status).toBe(404);
  expect((await unshare(alice, first.share, {})).status).toBe(403);
  expect(await html()).toContain("3 songs");
  expect((await mine(bob)).map((item) => item.id)).not.toContain(first.share);

  expect((await unshare(alice, first.share)).status).toBe(200);
  expect(await html()).toContain('property="og:title" content="lodesong"');
  const card = await image(`https://music.example/og/album/al-2.jpg?s=${first.token}`);
  expect(card.headers.get("cache-control")).toBe("public, max-age=86400");
  expect(await page(`?s=${second.token}`, BOT, "al-2")).toContain("3 songs");
  expect((await unshare(alice, first.share)).status).toBe(404);
});

test("sharing needs a sign-in, the header, an item the member can open, and is off in the public demo", async () => {
  const alice = await signIn("alice");
  const bob = await signIn("bob");
  expect((await post("", { kind: "album", id: "al-1" })).status).toBe(401);
  const bare = await api.shareCreate(
    new Request("http://app/api/share", {
      method: "POST",
      headers: { cookie: alice },
      body: JSON.stringify({ kind: "album", id: "al-1" }),
    }),
  );
  expect(bare.status).toBe(403);
  expect((await post(alice, { kind: "album", id: "al-priv" })).status).toBe(200);
  expect((await post(bob, { kind: "album", id: "al-priv" })).status).toBe(404);
  expect((await post(bob, { kind: "nope", id: "al-1" })).status).toBe(400);
  expect((await post(bob, { kind: "album", id: { $gt: "" } })).status).toBe(400);

  const demo = makeApi({ publicDemo: true });
  expect((await post(await signIn("alice", demo), { kind: "album", id: "al-1" }, demo)).status).toBe(403);
});

test("a member who creates links too fast is told to wait", async () => {
  const carol = await signIn("carol");
  const codes: number[] = [];
  for (let index = 0; index < 32; index++) codes.push((await post(carol, { kind: "album", id: `al-x${index}` })).status);
  expect(codes.slice(0, 30).every((code) => code === 200)).toBe(true);
  const limited = await post(carol, { kind: "album", id: "al-x99" });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await post(await signIn("dave"), { kind: "album", id: "al-1" })).status).toBe(200);
});

test("a card whose cover could not be fetched is not kept, and the next request draws the art", async () => {
  const cookie = await signIn("erin");
  const { token } = await shareLink(cookie, "al-cov");
  const url = imageUrl(await page(`?s=${token}`, BOT, "al-cov"));
  mock.coverFails = true;
  const bare = await image(url);
  expect(bare.headers.get("cache-control")).toBe("private, no-store");
  const bareSize = (await bytesOf(bare)).length;
  mock.coverFails = false;
  mock.coverUsers.length = 0;
  const full = await image(url);
  expect(full.headers.get("cache-control")).toBe("public, max-age=3600");
  expect(mock.coverUsers).toEqual(["erin"]);
  const fullSize = (await bytesOf(full)).length;
  expect(fullSize).not.toBe(bareSize);
  const kept = await image(url);
  expect(mock.coverUsers).toEqual(["erin"]);
  expect((await bytesOf(kept)).length).toBe(fullSize);
});

test("sharing does not fetch covers; they load when the card is drawn", async () => {
  mock.coverUsers.length = 0;
  await shareLink(await signIn("frank"), "al-cov2");
  expect(mock.coverUsers).toEqual([]);
});

test("control and bidi characters never reach the tags, and long names are cut", async () => {
  mock.name = `Evil${String.fromCodePoint(0x202e, 0)}name ${"x".repeat(5000)}`;
  const html = await page("", { cookie: await signIn("gina") }, "al-evil");
  const title = /property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(title).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  expect(title.length).toBeLessThanOrEqual(100);
  mock.name = NAME;
});

test("the public address comes from config, and forwarded headers only count behind a trusted proxy", async () => {
  const configured = makeApi({ publicUrl: "https://tunes.example", trustProxy: true });
  const html = await page("", { cookie: await signIn("alice", configured), "x-forwarded-host": "evil.example" }, "al-1", configured);
  expect(html).toContain('content="https://tunes.example/og/album/al-1.jpg"');
  const trusted = makeApi({ trustProxy: true });
  const proxied = await page(
    "",
    { cookie: await signIn("alice", trusted), "x-forwarded-host": "edge.example", "x-forwarded-proto": "https" },
    "al-1",
    trusted,
  );
  expect(proxied).toContain('content="https://edge.example/og/album/al-1.jpg"');
});

test("the og tags are cut to length whatever the album says", async () => {
  mock.name = "n".repeat(300);
  mock.artist = "a".repeat(500);
  const html = await page("", { cookie: await signIn("hugo") }, "al-long");
  mock.name = NAME;
  mock.artist = "Orbit Hollow";
  const description = /property="og:description" content="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(description.length).toBeGreaterThan(150);
  expect(description.length).toBeLessThanOrEqual(200);
});

test("a full share list is refused with a message instead of growing", async () => {
  const small = makeApi({ shareMax: 2 });
  const cookie = await signIn("ivy", small);
  expect((await post(cookie, { kind: "album", id: "al-1" }, small)).status).toBe(200);
  expect((await post(cookie, { kind: "album", id: "al-2" }, small)).status).toBe(200);
  const full = await post(cookie, { kind: "album", id: "al-3" }, small);
  expect(full.status).toBe(409);
  expect(((await full.json()) as { error: string }).error).toContain("remove some");
  expect((await post(cookie, { kind: "album", id: "al-2" }, small)).status).toBe(200);
});

test("a burst of different cards is answered 503 with a retry time once the render queue is full", async () => {
  const cookie = await signIn("jon");
  const ids = Array.from({ length: 14 }, (_, index) => `al-q${index}`);
  const replies = await Promise.all(ids.map((id) => image(`https://music.example/og/album/${id}.jpg`, { cookie })));
  const busy = replies.filter((reply) => reply.status === 503);
  expect(busy.length).toBeGreaterThan(0);
  expect(replies.filter((reply) => reply.status === 200).length).toBeGreaterThanOrEqual(8);
  expect(busy[0]?.headers.get("retry-after")).toBe("5");
  expect(busy[0]?.headers.get("cache-control")).toBe("no-store");
}, 30_000);

test("two servers with the same card id and different covers draw their own image", async () => {
  const here = await signIn("kim", api, "home");
  const there = await signIn("kim", api, "away");
  const first = await bytesOf(await image("https://music.example/og/album/al-cov.jpg", { cookie: here }));
  const second = await bytesOf(await image("https://music.example/og/album/al-cov.jpg", { cookie: there }));
  expect(second.length).not.toBe(first.length);
});
