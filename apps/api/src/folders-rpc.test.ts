import { afterAll, expect, test } from "bun:test";
import { createKeepClient } from "@lodesong/orpc/client";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const KNOWN = ["pl-1", "pl-2", "pl-3"];
const upstream = Bun.serve({
  port: 0,
  fetch: (request) => {
    const url = new URL(request.url);
    const ok = { "subsonic-response": { status: "ok" } };
    if (url.pathname.includes("getPlaylists"))
      return Response.json({ "subsonic-response": { status: "ok", playlists: { playlist: KNOWN.map((id) => ({ id })) } } });
    if (url.pathname.includes("deletePlaylist") && url.searchParams.get("id") === "pl-3")
      return Response.json({ "subsonic-response": { status: "failed" } });
    if (url.pathname.includes("getPlaylist") && !KNOWN.includes(url.searchParams.get("id") ?? ""))
      return Response.json({ "subsonic-response": { status: "failed" } });
    return Response.json(ok);
  },
});
afterAll(() => upstream.stop());

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function setup(publicDemo = false) {
  const sessions = new SessionStore(":memory:", "secret", 60_000);
  const library = openLibraryDb(":memory:");
  const api = createApi({
    upstreams: [{ id: "default", url: `http://127.0.0.1:${upstream.port}` }],
    indexes: new Map(),
    library,
    lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
    covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
    sessions,
    limiter: new LoginLimiter(),
    idleSeconds: 60,
    trustProxy: false,
    publicDemo,
  });
  const as = (user: string) => {
    const cookie = `kp_session=${sessions.create({ server: "default", user, token: "t", salt: "s", agent: "" })}`;
    const headers = { "x-lodesong": "1", cookie };
    return {
      rpc: createKeepClient("http://app/api/rpc", headers, (request) => api.rpc(request)),
      picture: (id: string, extra: Record<string, string> = {}) =>
        api.folderPicture(
          Object.assign(new Request(`http://app/api/folders/${id}/cover`, { headers: { cookie, ...extra } }), { params: { id } }),
        ),
      proxy: (path: string) => api.proxy(new Request(`http://app${path}`, { headers })),
    };
  };
  return {
    api,
    as,
    sessions,
    signedOut: (id: string) => api.folderPicture(Object.assign(new Request("http://app/x"), { params: { id } })),
  };
}

const dataUrl = async (format: "png" | "jpeg") => {
  const image = new Bun.Image(PIXEL).resize(48, 48);
  return `data:image/${format};base64,${Buffer.from(await (format === "png" ? image.png() : image.jpeg({ quality: 80 })).bytes()).toString("base64")}`;
};

test("inputs are bounded and refused with their own reason: long names and ids, an empty parent, a missing or foreign parent", async () => {
  const { as } = setup();
  const { rpc } = as("me");
  await expect(rpc.folders.create({ name: "x".repeat(81), parentId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(rpc.folders.create({ name: "ok", parentId: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(rpc.folders.create({ name: "ok", parentId: "x".repeat(65) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(rpc.folders.create({ name: "   ", parentId: null })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "invalid" });
  await expect(rpc.folders.create({ name: "ok", parentId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "missing" });
  await expect(rpc.folders.place({ id: "x".repeat(65), folderId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(rpc.folders.update({ id: "x", parentId: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

  const top = await rpc.folders.create({ name: "top", parentId: null });
  const { rpc: other } = as("other");
  await expect(other.folders.create({ name: "in yours", parentId: top.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  let parent = top.id;
  for (const name of ["b", "c", "d"]) parent = (await rpc.folders.create({ name, parentId: parent })).id;
  await expect(rpc.folders.create({ name: "e", parentId: parent })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "too deep" });
});

test("place answers just ok, only for a playlist that exists and a folder that is yours, and each account has its own", async () => {
  const { as } = setup();
  const { rpc } = as("me");
  const folder = await rpc.folders.create({ name: "Shelf", parentId: null });
  expect(await rpc.folders.place({ id: "pl-1", folderId: folder.id })).toEqual({ ok: true });
  await expect(rpc.folders.place({ id: "gone", folderId: folder.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(rpc.folders.place({ id: "pl-2", folderId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const { rpc: other } = as("other");
  await expect(other.folders.place({ id: "pl-2", folderId: folder.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await other.folders.list()).toEqual({ folders: [], items: [] });
  expect((await rpc.folders.list()).items).toEqual([{ playlistId: "pl-1", folderId: folder.id }]);
  expect(await rpc.folders.place({ id: "pl-1", folderId: null })).toEqual({ ok: true });
  expect((await rpc.folders.list()).items).toEqual([]);
});

test("a picture is checked for real, kept out of the list, and served to its owner only with a version to cache by", async () => {
  const { as, signedOut } = setup();
  const { rpc, picture } = as("me");
  const folder = await rpc.folders.create({ name: "Art", parentId: null });
  await expect(rpc.folders.update({ id: folder.id, cover: "data:image/png;base64,AAAA" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "bad picture",
  });
  const saved = await rpc.folders.update({ id: folder.id, cover: await dataUrl("jpeg") });
  expect(saved.coverVersion).toBeTruthy();
  const listed = JSON.stringify(await rpc.folders.list());
  expect(listed).not.toContain("data:");
  expect(listed.length).toBeLessThan(300);

  const response = await picture(folder.id);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  const etag = response.headers.get("etag") ?? "";
  expect((await picture(folder.id, { "if-none-match": etag })).status).toBe(304);
  expect((await picture("nope")).status).toBe(404);
  expect((await as("other").picture(folder.id)).status).toBe(404);
  expect((await signedOut(folder.id)).status).toBe(401);
  expect((await rpc.folders.update({ id: folder.id, cover: null })).coverVersion).toBeNull();
  expect((await picture(folder.id)).status).toBe(404);
});

test("the picture is yours alone to fetch: another account, a terminal token and a signed-out request are all turned away", async () => {
  const { api, as, sessions } = setup();
  const { rpc } = as("me");
  const folder = await rpc.folders.create({ name: "Art", parentId: null });
  await rpc.folders.update({ id: folder.id, cover: await dataUrl("png") });
  const fetchWith = (token: string) =>
    api.folderPicture(
      Object.assign(new Request("http://app/x", { headers: { authorization: `Bearer ${token}` } }), { params: { id: folder.id } }),
    );
  expect((await fetchWith(sessions.create({ server: "default", user: "me", token: "t", salt: "s", agent: "api token" }))).status).toBe(200);
  expect(
    (await fetchWith(sessions.create({ server: "default", user: "me", token: "t", salt: "s", agent: "terminal · now playing" }))).status,
  ).toBe(401);
  expect((await fetchWith(sessions.create({ server: "default", user: "other", token: "t", salt: "s", agent: "api token" }))).status).toBe(
    404,
  );
  expect((await fetchWith("nope")).status).toBe(401);
});

test("the public demo takes folders but no pictures, and only a few", async () => {
  const { as } = setup(true);
  const { rpc } = as("demo");
  const folder = await rpc.folders.create({ name: "first", parentId: null });
  await expect(rpc.folders.update({ id: folder.id, cover: await dataUrl("png") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(rpc.folders.update({ id: folder.id, cover: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await rpc.folders.update({ id: folder.id, name: "renamed" })).name).toBe("renamed");
  for (let at = 1; at < 10; at += 1) await rpc.folders.create({ name: `f${at}`, parentId: null });
  await expect(rpc.folders.create({ name: "eleventh", parentId: null })).rejects.toMatchObject({ message: "too many" });
});

test("import makes the whole tree or nothing, and refuses playlists that are not there", async () => {
  const { as } = setup();
  const { rpc } = as("me");
  const tree = (playlists: string[]) => ({
    parentId: null,
    folders: [
      { parent: null, name: "Old", playlists: ["pl-1"] },
      { parent: 0, name: "Night", playlists },
    ],
  });
  await expect(rpc.folders.import(tree(["pl-2", "gone"]))).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await rpc.folders.list()).toEqual({ folders: [], items: [] });
  expect(await rpc.folders.import(tree(["pl-2", "pl-3"]))).toEqual({ ok: true });
  const { folders, items } = await rpc.folders.list();
  expect(folders.map((folder) => folder.name)).toEqual(["Old", "Night"]);
  expect(items).toHaveLength(3);
  await expect(rpc.folders.import({ parentId: null, folders: [{ parent: 3, name: "x", playlists: [] }] })).rejects.toMatchObject({
    message: "invalid",
  });
});

test("deleting a playlist through lodesong drops its folder placement, for that account only", async () => {
  const { as } = setup();
  const { rpc, proxy } = as("me");
  const { rpc: other } = as("other");
  for (const client of [rpc, other]) {
    const folder = await client.folders.create({ name: "Shelf", parentId: null });
    await client.folders.place({ id: "pl-1", folderId: folder.id });
    await client.folders.place({ id: "pl-2", folderId: folder.id });
  }
  const folder = (await rpc.folders.list()).folders[0]?.id ?? "";
  await rpc.folders.place({ id: "pl-3", folderId: folder });
  expect((await proxy("/rest/deletePlaylist?id=pl-3")).status).toBe(200);
  expect((await rpc.folders.list()).items.map((item) => item.playlistId).sort()).toEqual(["pl-1", "pl-2", "pl-3"]);
  expect((await proxy("/rest/deletePlaylist?id=pl-1")).status).toBe(200);
  expect((await rpc.folders.list()).items.map((item) => item.playlistId).sort()).toEqual(["pl-2", "pl-3"]);
  expect((await other.folders.list()).items).toHaveLength(2);
});
