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
  const gone = first.slice(0, 2);
  for (const artist of gone) db.run("delete from idx_items where id = ?", [`${artist}1`]);
  const after = names();
  expect(after).toHaveLength(5);
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

const songsOf = (db: ReturnType<typeof openLibraryDb>, artists: string[], count: number) =>
  index(
    db,
    artists.flatMap((artist) => Array.from({ length: count }, (_, i) => song(`${artist}-${i}`, artist, `${artist} ${i}`))),
  );
const heard = (db: ReturnType<typeof openLibraryDb>, account: string, artists: string[], times: number, title = 0) => {
  for (let i = 0; i < times; i++) {
    const before = db.query<{ n: number }, [string]>("select count(*) as n from plays where account = ?").get(account)?.n ?? 0;
    artists.forEach((artist, n) => {
      recordPlay(db, account, "", {
        song: song("p", artist, `${artist} ${title}`),
        started: NOW - (before + 1) * 3 * 3_600_000 + n * 600_000,
        listened: 200,
        finished: true,
      });
    });
  }
};
const artistsIn = (mix?: { songs: { artist?: string }[] }) => [...new Set(mix?.songs.map((item) => item.artist))].sort();
const firstMix = (db: ReturnType<typeof openLibraryDb>, account = "s:u") => dailyMixes(db, "s", account, 20_000, NOW)[0];

test("artists next to the artists next to a seed join its mix at a lower weight", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  songsOf(db, ["Seed", "Nina", "Nova", "Ada"], 12);
  heard(db, "s:u", ["Seed"], 80);
  heard(db, "s:u", ["Seed", "Nina"], 10);
  heard(db, "s:u", ["Seed", "Nova"], 8);
  heard(db, "s:u", ["Nina", "Ada"], 10);
  const mix = firstMix(db);
  expect(mix?.description).toBe("Seed, Nina, Nova");
  expect(artistsIn(mix)).toEqual(["Ada", "Nina", "Nova", "Seed"]);
});

test("a mix draws on at most 15 artists", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const near = Array.from({ length: 5 }, (_, i) => `Near ${i}`);
  const far = near.map((_, i) => Array.from({ length: 5 }, (_, k) => `Far ${i}-${k}`));
  songsOf(db, ["Seed", ...near, ...far.flat()], 10);
  heard(db, "s:u", ["Seed"], 80);
  near.forEach((name, i) => {
    heard(db, "s:u", ["Seed", name], 6);
    for (const other of far[i] ?? []) heard(db, "s:u", [name, other], 3);
  });
  expect(artistsIn(firstMix(db))).toHaveLength(15);
});

test("a seed is joined by the five artists it was played next to most", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const near = Array.from({ length: 7 }, (_, i) => `Near ${i}`);
  songsOf(db, ["Seed", ...near], 12);
  heard(db, "s:u", ["Seed"], 80);
  near.forEach((name, i) => {
    heard(db, "s:u", ["Seed", name], 7 - i);
  });
  expect(artistsIn(firstMix(db))).toEqual(["Near 0", "Near 1", "Near 2", "Near 3", "Near 4", "Seed"]);
});

test("one artist takes at most a fifth of a mix while others have songs left", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const near = ["N1", "N2", "N3", "N4"];
  songsOf(db, ["Seed"], 60);
  songsOf(db, near, 30);
  for (let i = 0; i < 60; i++) heard(db, "s:u", ["Seed"], 1, i);
  heard(db, "s:u", ["Seed", ...near], 6);
  const mix = firstMix(db);
  expect(mix?.songs).toHaveLength(50);
  const count = (artist: string) => mix?.songs.filter((item) => item.artist === artist).length;
  expect([count("Seed"), count("N1"), count("N2"), count("N3"), count("N4")]).toEqual([10, 10, 10, 10, 10]);
});

test("groups of artists played together still make a mix each, even when one link joins them", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  const groups = [0, 1, 2].map((g) => Array.from({ length: 5 }, (_, k) => `G${g}A${k}`));
  songsOf(db, groups.flat(), 12);
  for (const group of groups) heard(db, "s:u", group, 6);
  heard(db, "s:u", ["G0A0", "G1A0"], 1);
  heard(db, "s:u", ["G1A1", "G2A1"], 1);
  const mixes = dailyMixes(db, "s", "s:u", 20_000, NOW);
  expect(mixes).toHaveLength(3);
  expect(mixes.every((mix) => artistsIn(mix).length >= 5)).toBe(true);
});

test("a song under two ids doesn't take two of the fifty slots", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  songsOf(db, ["Hurt"], 60);
  index(
    db,
    Array.from({ length: 30 }, (_, i) => song(`copy-${i}`, "Hurt", `Hurt ${i}`)),
  );
  heard(db, "s:u", ["Hurt"], 6);
  const titles = firstMix(db)?.songs.map((item) => item.title) ?? [];
  expect(titles).toHaveLength(50);
  expect(new Set(titles).size).toBe(50);
});

test("a stored day replays the same after a never pref and after the index changes", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  songsOf(db, ["Hurt", "Tool"], 40);
  heard(db, "s:u", ["Hurt", "Tool"], 6);
  const ids = () => idsOn(db, "s:u", 20_000);
  const first = ids();
  const dropped = first[0] ?? "";
  changeSong(db, "s:u", dropped, { never: true });
  const afterNever = ids();
  expect(afterNever).toEqual(first.filter((id) => id !== dropped));
  expect([ids(), ids()]).toEqual([afterNever, afterNever]);
  index(db, [song("late", "Hurt", "Late One")]);
  expect([ids(), ids(), ids()]).toEqual([afterNever, afterNever, afterNever]);
});

const listen = (db: ReturnType<typeof openLibraryDb>, account: string, title: string, times: number, daysAgo = 20, finished = true) => {
  for (let i = 0; i < times; i++)
    recordPlay(db, account, "", {
      song: song("p", "Hurt", title),
      started: NOW - daysAgo * DAY_MS - i * 60_000,
      listened: finished ? 200 : 5,
      finished,
    });
};
const hurt = (db: ReturnType<typeof openLibraryDb>, count: number) =>
  index(
    db,
    Array.from({ length: count }, (_, i) => song(`Hurt-${i}`, "Hurt", `Hurt ${i}`)),
  );
const titlesOn = (db: ReturnType<typeof openLibraryDb>, account = "s:u", liked = new Set<string>()) =>
  new Set(dailyMixes(db, "s", account, 20_000, NOW, liked)[0]?.songs.map((item) => item.title));
const inMix = (mix: Set<string | undefined>, from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `Hurt ${from + i}`).filter((t) => mix.has(t));

test("songs you replayed come before songs you played once", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (let i = 0; i < 100; i++) listen(db, "s:u", `Hurt ${i}`, i < 50 ? 6 : 1);
  expect(inMix(titlesOn(db), 0, 50)).toHaveLength(50);
});

test("a like outweighs a hundred replays", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (let i = 0; i < 100; i++) listen(db, "s:u", `Hurt ${i}`, i < 50 ? 1 : 100);
  const liked = new Set(Array.from({ length: 50 }, (_, i) => `Hurt-${i}`));
  expect(inMix(titlesOn(db, "s:u", liked), 0, 50)).toHaveLength(50);
});

test("songs you skip sink, but one skip doesn't sink a song you replay", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (let i = 0; i < 100; i++) listen(db, "s:u", `Hurt ${i}`, 1);
  for (let i = 0; i < 50; i++) listen(db, "s:u", `Hurt ${i}`, 3, 10, false);
  expect(inMix(titlesOn(db), 50, 100)).toHaveLength(50);

  const loved = openLibraryDb(":memory:");
  createIndexTables(loved);
  hurt(loved, 100);
  for (let i = 0; i < 100; i++) listen(loved, "s:u", `Hurt ${i}`, i < 50 ? 40 : 1);
  for (let i = 0; i < 50; i++) listen(loved, "s:u", `Hurt ${i}`, 1, 10, false);
  expect(inMix(titlesOn(loved), 0, 50)).toHaveLength(50);
});

test("a liked song you keep skipping and never finish sinks", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 101);
  listen(db, "s:u", "Hurt 100", 6);
  for (let i = 0; i < 50; i++) listen(db, "s:u", `Hurt ${i}`, 5, 10, false);
  const liked = new Set(Array.from({ length: 50 }, (_, i) => `Hurt-${i}`));
  expect(inMix(titlesOn(db, "s:u", liked), 0, 50)).toHaveLength(0);
});

test("songs left alone for a while come up before ones you just played", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (let i = 0; i < 100; i++) listen(db, "s:u", `Hurt ${i}`, 1, i < 50 ? 60 : 14);
  expect(inMix(titlesOn(db), 0, 50)).toHaveLength(50);
});

test("a recently played like still beats a song left alone", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (let i = 0; i < 100; i++) listen(db, "s:u", `Hurt ${i}`, 1, i < 50 ? 3 : 60);
  const liked = new Set(Array.from({ length: 50 }, (_, i) => `Hurt-${i}`));
  expect(inMix(titlesOn(db, "s:u", liked), 0, 50)).toHaveLength(50);
});

test("one account's skips are its own, and songs with the same taste differ between accounts", () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  hurt(db, 100);
  for (const account of ["s:u", "s:v", "s:w"]) for (let i = 0; i < 100; i++) listen(db, account, `Hurt ${i}`, 1);
  for (let i = 0; i < 50; i++) listen(db, "s:u", `Hurt ${i}`, 3, 10, false);
  expect(inMix(titlesOn(db, "s:u"), 50, 100)).toHaveLength(50);
  const [v, w] = [titlesOn(db, "s:v"), titlesOn(db, "s:w")];
  expect(inMix(v, 0, 50).length).toBeGreaterThan(0);
  expect([...v].sort()).not.toEqual([...w].sort());
});
