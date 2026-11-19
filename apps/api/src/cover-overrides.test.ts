import { afterAll, expect, test } from "bun:test";
import { createKeepClient } from "@lodesong/orpc/client";
import { createApi } from "./api";
import { coverOverride, MAX_COVER_OVERRIDES, setCoverOverride } from "./cover-overrides";
import { CoverSources } from "./cover-sources";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { MusicBrainz } from "./releases";
import { SessionStore } from "./sessions";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (size: number) => new Bun.Image(PIXEL).resize(size, size).png().bytes();
const GROUP = "c0c0c0c0-0000-4000-8000-000000000001";
const BARE = "c0c0c0c0-0000-4000-8000-000000000002";

const navidromeAsked: string[] = [];
let big = false;
let jump = false;
const fake = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/rest/getCoverArt") {
      navidromeAsked.push(url.searchParams.get("id") ?? "");
      return new Response(await png(64), { headers: { "content-type": "image/png" } });
    }
    if (url.pathname === "/mb/ws/2/release-group")
      return Response.json({
        "release-groups": [
          { id: GROUP, title: "Found", "artist-credit": [{ name: "Them" }] },
          { id: BARE, title: "Bare", "artist-credit": [{ name: "Them" }] },
        ],
      });
    if (url.pathname === `/caa/release-group/${GROUP}/front-250`)
      return new Response(await png(250), { headers: { "content-type": "image/png" } });
    // Cover Art Archive hands off to another host: followed only when that host is on the list.
    if (url.pathname === `/caa/release-group/${GROUP}/front-500`)
      return new Response(null, {
        status: 307,
        headers: { location: jump ? "http://169.254.169.254/latest" : big ? `${url.origin}/caa/huge` : `${url.origin}/caa/img/500` },
      });
    if (url.pathname === "/caa/img/500") return new Response(await png(500), { headers: { "content-type": "image/png" } });
    if (url.pathname === "/caa/huge") return new Response(new Uint8Array(500_000), { headers: { "content-type": "image/png" } });
    if (url.pathname === "/deezer/search/album")
      return Response.json({
        data: [{ id: 77, title: "Deezer One", artist: { name: "Them" }, cover_medium: "http://169.254.169.254/x.png" }],
      });
    if (url.pathname.startsWith("/caa/") || url.pathname.startsWith("/deezer/")) return new Response("nope", { status: 404 });
    return Response.json({ "subsonic-response": { status: "ok" } });
  },
});
afterAll(() => fake.stop());

const origin = `http://127.0.0.1:${fake.port}`;
const sources = () =>
  new CoverSources({ musicbrainz: new MusicBrainz(`${origin}/mb`, fetch, 0), archiveUrl: `${origin}/caa`, deezerUrl: `${origin}/deezer` });

const sessions = new SessionStore(":memory:", "secret", 60_000);
const library = openLibraryDb(":memory:");
const build = (publicDemo = false) =>
  createApi({
    upstreams: [{ id: "default", url: origin }],
    indexes: new Map(),
    library,
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    coverSources: sources(),
    publicDemo,
  });
const api = build();
const mine = sessions.create({ server: "default", user: "demo", token: "t", salt: "s", agent: "" });
const theirs = sessions.create({ server: "default", user: "other", token: "t", salt: "s", agent: "" });
const rpc = (session: string, handler = api) =>
  createKeepClient("http://app/api/rpc", { "x-lodesong": "1", cookie: `kp_session=${session}` }, (request) => handler.rpc(request));
const cover = (session: string, id: string, query = "") =>
  api.cover(
    Object.assign(new Request(`http://app/cover/${id}/256${query}`, { headers: { cookie: `kp_session=${session}` } }), {
      params: { id, size: "256" },
    }),
  );

test("candidates skip pictures that are missing or sit on a host off the list", async () => {
  const found = await rpc(mine).covers.candidates({ kind: "album", name: "Found", artist: "Them" });
  expect(found.candidates.map((item) => item.id)).toEqual([`archive:${GROUP}`]);
  expect(found.candidates[0]?.thumb).toStartWith("data:image/png;base64,");
});

test("a picked cover is kept per account and served before Navidrome, at a url that carries its version", async () => {
  const before = await cover(mine, "al-1");
  expect(before.headers.get("cache-control")).toContain("immutable");
  expect(navidromeAsked).toEqual(["al-1"]);

  const chosen = await rpc(mine).covers.setOverride({ id: "al-1", candidate: `archive:${GROUP}` });
  expect(chosen.version).toMatch(/^[0-9a-f]{16}$/);
  expect(await rpc(mine).covers.overrides()).toEqual({ overrides: [{ id: "al-1", version: chosen.version }] });
  expect(await rpc(theirs).covers.overrides()).toEqual({ overrides: [] });

  const served = await cover(mine, "al-1", `?v=${chosen.version}`);
  expect(served.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
  expect(Buffer.from(await served.arrayBuffer()).length).toBe((await png(500)).length);
  // An url without the version (an old tab) still shows the pick, but is never cached as forever.
  expect((await cover(mine, "al-1")).headers.get("cache-control")).toBe("private, no-cache");
  expect((await cover(mine, "al-1", `?v=stale`)).headers.get("cache-control")).toBe("private, no-cache");
  expect(navidromeAsked).toEqual(["al-1"]);

  // Another account still gets Navidrome's cover for the same id.
  expect((await cover(theirs, "al-1")).headers.get("cache-control")).toContain("immutable");
  expect(navidromeAsked.at(-1)).toBe("al-1");
  expect(navidromeAsked.length).toBe(2);

  await rpc(mine).covers.removeOverride({ id: "al-1" });
  expect((await rpc(mine).covers.overrides()).overrides).toEqual([]);
  expect((await cover(mine, "al-1")).headers.get("cache-control")).toContain("immutable");
});

test("ids are validated and a picture that is too big or isn't there is refused", async () => {
  const client = rpc(mine);
  for (const candidate of ["http://evil/x.png", "archive:../x", `archive:${GROUP}/../x`, "deezer:12a", "file:///etc/passwd"])
    await expect(client.covers.setOverride({ id: "al-1", candidate })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(client.covers.setOverride({ id: "../etc", candidate: `archive:${GROUP}` })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(client.covers.setOverride({ id: "al-1", candidate: `archive:${BARE}` })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  big = true;
  await expect(client.covers.setOverride({ id: "al-1", candidate: `archive:${GROUP}` })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  big = false;
  jump = true;
  await expect(client.covers.setOverride({ id: "al-1", candidate: `archive:${GROUP}` })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
  jump = false;
  expect((await client.covers.overrides()).overrides).toEqual([]);
});

test("only listed hosts are fetched: a redirect off the list, plain http and credentials are refused", () => {
  const strict = new CoverSources({ musicbrainz: null, archiveUrl: "https://coverartarchive.org", deezerUrl: "https://api.deezer.com" });
  const ok = (url: string) => strict.allowed(new URL(url));
  expect(ok("https://coverartarchive.org/release-group/x/front-500")).toBe(true);
  expect(ok("https://ia800000.us.archive.org/1/items/x/y.jpg")).toBe(true);
  expect(ok("https://e-cdns-images.dzcdn.net/images/cover/x/1000x1000.jpg")).toBe(true);
  expect(ok("https://api.deezer.com/album/1")).toBe(true);
  expect(ok("http://e-cdns-images.dzcdn.net/x.jpg")).toBe(false);
  expect(ok("https://dzcdn.net.evil.com/x.jpg")).toBe(false);
  expect(ok("https://evil.com/dzcdn.net")).toBe(false);
  expect(ok("https://user:pw@coverartarchive.org/x")).toBe(false);
  expect(ok("https://coverartarchive.org:8443/x")).toBe(false);
  expect(ok("http://169.254.169.254/latest")).toBe(false);
  expect(ok("https://localhost/x.png")).toBe(false);
});

test("searches are rate limited, and the public demo refuses all of it", async () => {
  const demo = build(true);
  const guest = sessions.create({ server: "default", user: "guest", token: "t", salt: "s", agent: "" });
  await expect(rpc(guest, demo).covers.candidates({ kind: "album", name: "Found", artist: "Them" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(rpc(guest, demo).covers.setOverride({ id: "al-1", candidate: `archive:${GROUP}` })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(rpc(guest, demo).covers.removeOverride({ id: "al-1" })).rejects.toMatchObject({ code: "FORBIDDEN" });

  const client = rpc(theirs);
  const searches = Array.from({ length: 21 }, () =>
    client.covers.candidates({ kind: "artist", name: "Them", artist: "" }).catch((error) => error),
  );
  const results = await Promise.all(searches);
  expect(results.filter((item) => item?.code === "TOO_MANY_REQUESTS")).toHaveLength(1);
});

test("an account keeps at most 500 replaced covers", async () => {
  const picture = { type: "image/png", hash: "h", bytes: new Uint8Array([1]) } as Parameters<typeof setCoverOverride>[3];
  const db = openLibraryDb(":memory:");
  for (let at = 0; at < MAX_COVER_OVERRIDES; at++) expect(setCoverOverride(db, "a", `c${at}`, picture)).toBe(true);
  expect(setCoverOverride(db, "a", "extra", picture)).toBe(false);
  expect(setCoverOverride(db, "a", "c0", { ...picture, hash: "new" })).toBe(true);
  expect(coverOverride(db, "a", "c0")?.hash).toBe("new");
  expect(coverOverride(db, "b", "c0")).toBeNull();
});
