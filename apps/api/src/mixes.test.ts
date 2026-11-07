import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import { dailyMixes, mixesVersion, nearToday } from "./mixes";
import { changeSong } from "./prefs";
import { createIndexTables } from "./search-index";

const NOW = Date.UTC(2026, 9, 24, 12);
const DAY_MS = 86_400_000;
const song = (id: string, artist: string, title: string) => ({ id, artist, title });

test("plays count by artist and title even when the song's id changed, and artists played together share a mix", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const library = [
    song("a1", "Hurt", "Rapture"),
    song("a2", "Hurt", "Falls Apart"),
    song("b1", "Tool", "Sober"),
    song("c1", "Abba", "SOS"),
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  // Played under ids that no longer exist (the files moved since), each Hurt play followed by Tool.
  for (let i = 0; i < 6; i++) {
    const at = NOW - (i + 1) * DAY_MS;
    recordPlay(db, "s:u", "", { song: song(`old-${i}`, "Hurt", "Rapture"), started: at, listened: 200, finished: true });
    recordPlay(db, "s:u", "", { song: song(`old-t${i}`, "Tool", "Sober"), started: at + 600_000, listened: 200, finished: true });
  }

  const mixes = dailyMixes(db, "s", "s:u", 20_000, NOW);
  expect(mixes).toHaveLength(1);
  const mix = mixes[0];
  expect(mix?.description.split(", ").sort()).toEqual(["Hurt", "Tool"]);
  expect(mix?.songs.map((item) => item.id).sort()).toEqual(["a1", "a2", "b1"]);
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toEqual(mixes);
});

test("discover weekly is only songs you never played; the daylist follows what you play at that hour", async () => {
  const { madeForYou } = await import("./mixes");
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const library = [
    song("a1", "Hurt", "Rapture"),
    song("a2", "Hurt", "Falls Apart"),
    song("n1", "Abba", "SOS"),
    song("m1", "Mitski", "Nobody"),
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  // Hurt every morning (08:00 UTC), Mitski every night (23:00 UTC).
  const midnight = Date.UTC(2026, 9, 24);
  for (let i = 1; i <= 6; i++) {
    recordPlay(db, "s:u", "", {
      song: song("x", "Hurt", "Rapture"),
      started: midnight - i * DAY_MS + 8 * 3_600_000,
      listened: 200,
      finished: true,
    });
    recordPlay(db, "s:u", "", {
      song: song("y", "Mitski", "Nobody"),
      started: midnight - i * DAY_MS + 23 * 3_600_000,
      listened: 200,
      finished: true,
    });
  }
  const at = (hour: number) => madeForYou(db, "s", "s:u", { day: 20_385, hour, tzMinutes: 0 }, NOW);
  const discover = at(9).find((mix) => mix.id === "discover-weekly");
  expect(discover?.songs.map((item) => item.id).sort()).toEqual(["a2", "n1"]);
  expect(at(9).find((mix) => mix.id === "daylist")?.description).toContain("morning: Hurt");
  expect(at(23).find((mix) => mix.id === "daylist")?.description).toContain("night: Mitski");
});

test("release radar is new songs by artists you play; on this day is what you played a year ago", async () => {
  const { madeForYou, listening } = await import("./mixes");
  const { moodMixes } = await import("./mood-mixes");
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const fresh = new Date(NOW - 5 * DAY_MS).toISOString();
  const old = new Date(NOW - 200 * DAY_MS).toISOString();
  const library = [
    { ...song("h1", "Hurt", "Rapture"), created: old },
    { ...song("h2", "Hurt", "New One"), created: fresh },
    { ...song("z1", "Zola", "Brand New"), created: fresh },
  ];
  for (const item of library)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  recordPlay(db, "s:u", "", { song: song("x", "Hurt", "Rapture"), started: NOW - DAY_MS, listened: 200, finished: true });
  recordPlay(db, "s:u", "", { song: song("y", "Hurt", "Rapture"), started: NOW - 366 * DAY_MS, listened: 200, finished: true });

  const mixes = madeForYou(db, "s", "s:u", { day: 20_385, hour: 12, tzMinutes: 0 }, NOW);
  // Zola is new too, but you don't play Zola.
  expect(mixes.find((mix) => mix.id === "release-radar")?.songs.map((item) => item.id)).toEqual(["h2"]);
  expect(mixes.find((mix) => mix.id === "on-this-day")?.songs.map((item) => item.id)).toEqual(["h1"]);

  let calls = 0;
  const groq = (async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ focus: ["Hurt", "Not Mine"] }) } }] });
  }) as unknown as typeof fetch;
  const settings = { key: "k", model: "m", url: "http://groq" };
  for (const [id, artist] of [
    ["a1", "Abba"],
    ["t1", "Tool"],
  ] as const) {
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(id, JSON.stringify({ ...song(id, artist, "x"), created: old }));
    recordPlay(db, "s:u", "", { song: song(id, artist, "x"), started: NOW - 2 * DAY_MS, listened: 200, finished: true });
  }
  const l = listening(db, "s", "s:u", NOW);
  const first = await moodMixes(db, settings, "s:u", 20_385, l, groq);
  expect(first.map((mix) => mix.name)).toEqual(["focus mix"]);
  expect(first[0]?.songs.every((item) => item.artist === "Hurt")).toBe(true);
  await moodMixes(db, settings, "s:u", 20_386, l, groq);
  expect(calls).toBe(1);
});

test("the cache key for made for you changes with a play or a never pref, and only then", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const version = () => mixesVersion(db, "s", "s:u");
  const before = version();
  expect(version()).toBe(before);
  recordPlay(db, "s:u", "", { song: song("a1", "Hurt", "Rapture"), started: NOW, listened: 200, finished: true });
  const played = version();
  expect(played).not.toBe(before);
  recordPlay(db, "s:other", "", { song: song("a1", "Hurt", "Rapture"), started: NOW, listened: 200, finished: true });
  expect(version()).toBe(played);
  changeSong(db, "s:u", "a1", { never: true });
  expect(version()).not.toBe(played);
});

test("a day's daily mix is kept all day, and the next days steer away from it", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  for (let i = 0; i < 130; i++) {
    const item = song(`h${i}`, "Hurt", `Song ${i}`);
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
  }
  for (let i = 0; i < 6; i++)
    recordPlay(db, "s:u", "", { song: song("x", "Hurt", "Song 0"), started: NOW - (i + 1) * DAY_MS, listened: 200, finished: true });

  const first = dailyMixes(db, "s", "s:u", 20_000, NOW)[0]?.songs.map((item) => item.id) ?? [];
  expect(first).toHaveLength(50);
  recordPlay(db, "s:u", "", { song: song("y", "Hurt", "Song 1"), started: NOW, listened: 200, finished: true });
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)[0]?.songs.map((item) => item.id)).toEqual(first);

  const next = dailyMixes(db, "s", "s:u", 20_001, NOW)[0]?.songs.map((item) => item.id) ?? [];
  expect(next).toHaveLength(50);
  expect(next.filter((id) => first.includes(id)).every((id) => id === "h0" || id === "h1")).toBe(true);
});

const index = (db: ReturnType<typeof openLibraryDb>, items: { id: string; artist: string; title: string }[]) => {
  for (const item of items)
    db.query(
      "insert into idx_items (server, kind, id, folder, name, norm, plays, data, generation) values ('s', 'song', ?, '1', 'n', 'n', 0, ?, 1)",
    ).run(item.id, JSON.stringify(item));
};
const playsOf = (db: ReturnType<typeof openLibraryDb>, account: string, artist: string, title: string) => {
  for (let i = 0; i < 6; i++)
    recordPlay(db, account, "", { song: song("x", artist, title), started: NOW - (i + 1) * DAY_MS, listened: 200, finished: true });
};
const idsOn = (db: ReturnType<typeof openLibraryDb>, account: string, day: number) =>
  dailyMixes(db, "s", account, day, NOW)[0]?.songs.map((item) => item.id) ?? [];

test("seeds rotate through your top artists week to week", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  for (let a = 0; a < 20; a++) {
    index(db, [{ id: `a${a}`, artist: `Artist ${a}`, title: "x" }]);
    for (let i = 0; i < 8; i++)
      recordPlay(db, "s:u", "", {
        song: song("p", `Artist ${a}`, "x"),
        started: NOW - (a * 8 + i + 1) * 3 * 3_600_000,
        listened: 200,
        finished: true,
      });
  }
  const seeds = new Set<string>();
  for (let week = 0; week < 6; week++) for (const mix of dailyMixes(db, "s", "s:u", 20_000 + week * 7, NOW)) seeds.add(mix.description);
  expect(seeds.size).toBeGreaterThan(6);
});

test("accounts don't see each other's mixes, and cleaning one account leaves the other", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(db, [song("h", "Hurt", "x"), song("t", "Tool", "y")]);
  playsOf(db, "s:u", "Hurt", "x");
  playsOf(db, "s:v", "Tool", "y");
  dailyMixes(db, "s", "s:u", 20_000, NOW);
  expect(dailyMixes(db, "s", "s:v", 20_000, NOW)[0]?.description).toBe("Tool");
  dailyMixes(db, "s", "s:v", 20_100, NOW);
  expect(db.query("select count(*) as n from mix_days where account = 's:u'").get()).toEqual({ n: 1 });
});

test("mixes older than 14 days are cleaned and only the last 3 days are avoided", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(
    db,
    Array.from({ length: 130 }, (_, i) => song(`h${i}`, "Hurt", `Song ${i}`)),
  );
  playsOf(db, "s:u", "Hurt", "Song 0");
  const first = idsOn(db, "s:u", 20_000);
  const overlap = (day: number) => idsOn(db, "s:u", day).filter((id) => first.includes(id)).length;
  expect(overlap(20_004)).toBeGreaterThan(5);
  expect(overlap(20_003)).toBeLessThanOrEqual(1);
  const rows = (day: number) => db.query("select count(*) as n from mix_days where day = ?").get(day);
  idsOn(db, "s:u", 20_014);
  expect(rows(20_000)).toEqual({ n: 1 });
  idsOn(db, "s:u", 20_015);
  expect(rows(20_000)).toEqual({ n: 0 });
});

test("a small library still gets a full mix on the next day", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(
    db,
    Array.from({ length: 60 }, (_, i) => song(`h${i}`, "Hurt", `Song ${i}`)),
  );
  playsOf(db, "s:u", "Hurt", "Song 0");
  idsOn(db, "s:u", 20_000);
  expect(idsOn(db, "s:u", 20_001)).toHaveLength(50);
});

test("a day far from the server's is pulled back, so it can't wipe or flood the history", () => {
  const today = Math.floor(NOW / DAY_MS);
  expect(nearToday(today + 1, NOW)).toBe(today + 1);
  expect(nearToday(9_000_000_000, NOW)).toBe(today);
  expect(nearToday(-5, NOW)).toBe(today);
});

test("the same song under two ids shows once, and a repeat of the day's mix is identical", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(db, [song("alb", "Hurt", "Rapture"), song("cmp", "Hurt", "Rapture"), song("o", "Hurt", "Other")]);
  playsOf(db, "s:u", "Hurt", "Other");
  const first = idsOn(db, "s:u", 20_000);
  expect(new Set(first).size).toBe(first.length);
  expect(idsOn(db, "s:u", 20_000)).toEqual(first);
});

test("stored mixes whose songs are gone aren't served empty", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(db, [song("h", "Hurt", "x")]);
  playsOf(db, "s:u", "Hurt", "x");
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toHaveLength(1);
  db.run("delete from idx_items");
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toEqual([]);
});

test("a short list made early in the day grows when more artists qualify", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(db, [song("h", "Hurt", "x"), song("t", "Tool", "y")]);
  playsOf(db, "s:u", "Hurt", "x");
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toHaveLength(1);
  const gap = NOW - 30 * DAY_MS;
  for (let i = 0; i < 6; i++)
    recordPlay(db, "s:u", "", { song: song("y", "Tool", "y"), started: gap - i * 3 * 3_600_000, listened: 200, finished: true });
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW).length).toBeGreaterThan(1);
});

test("a day that regenerates after songs vanish stays the same on the next calls", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const artists = ["A", "B", "C", "D", "E", "F", "G"];
  index(
    db,
    artists.map((artist) => song(`${artist}1`, artist, "x")),
  );
  artists.forEach((artist, n) => {
    for (let i = 0; i < 6; i++)
      recordPlay(db, "s:u", "", {
        song: song("p", artist, "x"),
        started: NOW - (n * 6 + i + 1) * 3 * 3_600_000,
        listened: 200,
        finished: true,
      });
  });
  const names = () => dailyMixes(db, "s", "s:u", 20_000, NOW).map((mix) => mix.description);
  const first = names();
  expect(first).toHaveLength(6);
  const [gone] = first;
  db.run("delete from idx_items where id = ?", [`${gone}1`]);
  const after = names();
  expect(after).not.toContain(gone as string);
  expect(new Set(after).size).toBe(after.length);
  expect(names()).toEqual(after);
  expect(names()).toEqual(after);
});

test("a corrupt stored row is skipped instead of failing the mixes", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  index(db, [song("h", "Hurt", "x")]);
  playsOf(db, "s:u", "Hurt", "x");
  dailyMixes(db, "s", "s:u", 20_000, NOW);
  db.run("update mix_days set keys = 'oops'");
  expect(dailyMixes(db, "s", "s:u", 20_000, NOW)).toHaveLength(1);
});
