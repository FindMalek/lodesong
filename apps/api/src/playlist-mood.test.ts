import { afterAll, beforeEach, expect, test } from "bun:test";
import { memoryCache } from "./cache";
import { openLibraryDb } from "./db";
import { createMoodPlaylists } from "./playlist-mood";
import { listPlaylists, syncPlaylistSongs } from "./playlist-songs";
import type { Session } from "./sessions";

interface Fake {
  id: string;
  name: string;
  changed?: string;
  songs: string[];
}

let playlists: Record<string, Fake[]> = {};
let calls = { list: 0, one: 0 };
let broken = new Set<string>();
let delayMs = 0;
let inFlight = 0;
let mostInFlight = 0;

const navidrome = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const mine = playlists[url.searchParams.get("u") ?? ""] ?? [];
    const reply = (body: object) => Response.json({ "subsonic-response": { status: "ok", ...body } });
    if (url.pathname.endsWith("getPlaylists")) {
      calls.list += 1;
      return reply({
        playlists: {
          playlist: mine.map((item) => ({ id: item.id, name: item.name, songCount: item.songs.length, changed: item.changed ?? "t0" })),
        },
      });
    }
    calls.one += 1;
    inFlight += 1;
    mostInFlight = Math.max(mostInFlight, inFlight);
    if (delayMs) await Bun.sleep(delayMs);
    inFlight -= 1;
    const id = url.searchParams.get("id") ?? "";
    const found = mine.find((item) => item.id === id);
    if (!found || broken.has(id)) return new Response("nope", { status: 500 });
    return reply({ playlist: { id, entry: found.songs.map((song) => ({ id: song })) } });
  },
});
afterAll(() => navidrome.stop());
const upstream = { id: "default", url: `http://127.0.0.1:${navidrome.port}` };

const session = (user: string) => ({ server: "default", user, token: "t", salt: "s" }) as Session;
const alice = session("alice");
const bob = session("bob");

let clock = 0;
let db = openLibraryDb(":memory:");
let ask = createMoodPlaylists(
  db,
  memoryCache(() => clock),
);

beforeEach(() => {
  playlists = {};
  calls = { list: 0, one: 0 };
  broken = new Set();
  delayMs = 0;
  inFlight = 0;
  mostInFlight = 0;
  clock = 0;
  db = openLibraryDb(":memory:");
  ask = createMoodPlaylists(
    db,
    memoryCache(() => clock),
  );
});

const analyse = (id: string, energy: number, valence: number, bpm: number) =>
  db.query("insert or replace into song_features values ('default', ?, ?, 'C major', ?, ?, 0.5, 1)").run(id, bpm, energy, valence);

// An update keeps the row, so nothing tells the cache.
const quietly = (id: string) => db.query("update song_features set energy = 0.2, bpm = 70 where song_id = ?").run(id);

function make(id: string, name: string, count: number, sound: [number, number, number] | null, analysed = count, prefix = id): Fake {
  const songs = Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  if (sound) for (const song of songs.slice(0, analysed)) analyse(song, ...sound);
  return { id, name, songs };
}

const shape = (found: Awaited<ReturnType<typeof ask>>) => found?.playlists.map((item) => [item.id, item.reasons, item.fit]);

test("ranks by how the songs fit plus the name, and says why", async () => {
  playlists.alice = [
    make("hard", "Hard stuff", 10, [0.9, 0.5, 130]),
    make("tunes", "Gym tunes", 10, [0.5, 0.5, 90]),
    make("run", "Running", 10, [0.8, 0.5, 115]),
    make("rain", "Rain", 10, [0.2, 0.5, 70]),
    make("few", "Mystery", 10, [0.9, 0.5, 130], 2),
    make("basics", "Gym basics", 10, [0.9, 0.5, 130], 2),
    { id: "empty", name: "Gym empty", songs: [] },
  ];
  const found = await ask(upstream, alice, "gym");
  expect(shape(found)).toEqual([
    ["run", ["name", "loud", "fast"], 1],
    ["hard", ["loud", "fast"], 1],
    ["basics", ["name"], null],
    ["tunes", ["name"], null],
  ]);
  expect(calls.one).toBe(6);
  expect(found?.mood).toBe("gym");
  expect(found?.complete).toBe(true);
  expect(found?.playlists[0]?.analysed).toBe(10);
});

test("without AudioMuse features only the name counts, and the answer says so", async () => {
  playlists.alice = [make("hard", "Hard stuff", 10, null), make("run", "Morning run", 10, null), make("gym", "Gym", 10, null)];
  expect(shape(await ask(upstream, alice, "gym"))).toEqual([["gym", ["name"], null]]);
});

test("words mean their mood, unknown words mean none and cost no calls", async () => {
  playlists.alice = [make("hard", "Hard stuff", 5, [0.9, 0.5, 130])];
  expect((await ask(upstream, alice, "Workouts"))?.mood).toBe("gym");
  const before = { ...calls };
  expect(await ask(upstream, alice, "zzzzzz")).toEqual({ mood: "", playlists: [], complete: true });
  expect(calls).toEqual(before);
});

test("two accounts never see each other's playlists", async () => {
  playlists.alice = [make("secret", "Alice private", 6, [0.9, 0.5, 130]), make("shared", "Shared", 6, [0.9, 0.5, 130])];
  playlists.bob = [{ ...(playlists.alice[1] as Fake) }];
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["secret", "shared"]);
  expect(shape(await ask(upstream, bob, "gym"))?.map(([id]) => id)).toEqual(["shared"]);
  const rows = db.query<{ account: string; n: number }, []>("select account, count(*) as n from playlist_songs group by account").all();
  expect(rows).toEqual([
    { account: "default:alice", n: 2 },
    { account: "default:bob", n: 1 },
  ]);
});

test("accounts whose listings look the same still get their own answers", async () => {
  playlists.alice = [make("p1", "Loud one", 6, [0.9, 0.5, 130], 6, "alice")];
  playlists.bob = [make("p1", "Loud one", 6, [0.2, 0.5, 70], 6, "bob")];
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["p1"]);
  expect(await ask(upstream, bob, "gym")).toMatchObject({ playlists: [], complete: true });
  expect(shape(await ask(upstream, bob, "melancholy"))).toEqual([["p1", ["quiet", "dark"], 1]]);
  expect(await ask(upstream, alice, "melancholy")).toMatchObject({ playlists: [] });
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["p1"]);
});

test("the answer is cached, only changed playlists are read again, and features or playlist changes refresh it", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.9, 0.5, 130]), make("b", "Beta", 5, [0.9, 0.5, 130]), make("c", "Gamma", 5, [0.2, 0.5, 70])];
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["a", "b"]);
  expect(calls).toEqual({ list: 1, one: 3 });

  await ask(upstream, alice, "gym");
  expect(calls).toEqual({ list: 2, one: 3 });
  await ask(upstream, alice, "rainy");
  expect(calls).toEqual({ list: 3, one: 3 });

  for (const song of ["b-0", "b-1", "b-2", "b-3", "b-4"]) quietly(song);
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["a", "b"]);
  for (const song of ["b-0", "b-1", "b-2", "b-3", "b-4"]) analyse(song, 0.2, 0.5, 70);
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["a"]);

  const gamma = playlists.alice[2] as Fake;
  gamma.changed = "t1";
  gamma.songs = ["c-0", "c-1", "c-2", "c-3", "c-4", "c-5"];
  for (const song of gamma.songs) analyse(song, 0.9, 0.5, 130);
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["a", "c"]);
  expect(calls.one).toBe(4);

  (playlists.alice as Fake[]).splice(0, 1);
  expect(shape(await ask(upstream, alice, "gym"))?.map(([id]) => id)).toEqual(["c"]);
  expect(db.query("select playlist_id from playlist_songs").all()).toHaveLength(2);
});

test("a playlist is read again when only its change stamp or only its size moved", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.9, 0.5, 130])];
  await ask(upstream, alice, "gym");
  const alpha = playlists.alice[0] as Fake;
  alpha.changed = "t1";
  await ask(upstream, alice, "gym");
  expect(calls.one).toBe(2);
  alpha.songs = [...alpha.songs, "a-5"];
  await ask(upstream, alice, "gym");
  expect(calls.one).toBe(3);
  await ask(upstream, alice, "gym");
  expect(calls.one).toBe(3);
});

test("a cached answer is kept for ten minutes", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.9, 0.5, 130])];
  await ask(upstream, alice, "gym");
  for (let index = 0; index < 5; index += 1) quietly(`a-${index}`);
  clock = 9 * 60_000;
  expect(shape(await ask(upstream, alice, "gym"))).toHaveLength(1);
  clock = 11 * 60_000;
  expect(shape(await ask(upstream, alice, "gym"))).toEqual([]);
});

test("a rename refreshes the answer", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.5, 0.5, 90])];
  expect(shape(await ask(upstream, alice, "gym"))).toEqual([]);
  (playlists.alice[0] as Fake).name = "Gym";
  expect(shape(await ask(upstream, alice, "gym"))).toEqual([["a", ["name"], null]]);
});

test("a playlist that can't be read yet is left out, the rest answers, and the next ask reads only that one", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.9, 0.5, 130]), make("b", "Beta", 5, [0.9, 0.5, 130])];
  broken.add("b");
  const partial = await ask(upstream, alice, "gym");
  expect(partial).toMatchObject({ complete: false });
  expect(shape(partial)?.map(([id]) => id)).toEqual(["a"]);
  broken.clear();
  const callsBefore = calls.one;
  const whole = await ask(upstream, alice, "gym");
  expect(whole).toMatchObject({ complete: true });
  expect(shape(whole)?.map(([id]) => id)).toEqual(["a", "b"]);
  expect(calls.one - callsBefore).toBe(1);
});

test("asking at once reads the playlists once, and never more than 8 at a time", async () => {
  delayMs = 5;
  playlists.alice = Array.from({ length: 40 }, (_, index) => make(`p${index}`, `List ${index}`, 4, [0.9, 0.5, 130]));
  const [first, second] = await Promise.all([ask(upstream, alice, "gym"), ask(upstream, alice, "gym")]);
  expect(first?.playlists).toHaveLength(8);
  expect(second).toEqual(first);
  expect(calls.one).toBe(40);
  expect(mostInFlight).toBe(8);
});

test("reading stops at the time budget and says it isn't done", async () => {
  playlists.alice = [make("a", "Alpha", 5, [0.9, 0.5, 130])];
  const refs = [{ id: "a", name: "Alpha", songs: 5, changed: "t0" }];
  expect(await syncPlaylistSongs(db, upstream, alice, "default:alice", refs, 0)).toBe(false);
  expect(calls.one).toBe(0);
  expect(await syncPlaylistSongs(db, upstream, alice, "default:alice", refs)).toBe(true);
});

test("nine slow playlists still fit the time budget", async () => {
  delayMs = 120;
  playlists.alice = Array.from({ length: 9 }, (_, index) => make(`p${index}`, `List ${index}`, 4, [0.9, 0.5, 130]));
  expect(await ask(upstream, alice, "gym")).toMatchObject({ complete: true });
});

test("only the first 2000 playlists are listed", async () => {
  playlists.alice = Array.from({ length: 2100 }, (_, index) => ({ id: `p${index}`, name: `List ${index}`, songs: ["x"] }));
  expect(await listPlaylists(upstream, alice)).toHaveLength(2000);
});

test("a huge playlist keeps its first 2000 songs", async () => {
  playlists.alice = [{ id: "big", name: "Big", songs: Array.from({ length: 2100 }, (_, index) => `s${index}`) }];
  await ask(upstream, alice, "gym");
  expect(db.query<{ n: number }, []>("select json_array_length(songs) as n from playlist_songs").get()?.n).toBe(2000);
});

test("Navidrome not answering is an error, not an empty answer", async () => {
  const gone = { id: "default", url: "http://127.0.0.1:1" };
  expect(await ask(gone, alice, "gym")).toBeNull();
});
