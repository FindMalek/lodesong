import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { recordPlay } from "./history";
import {
  diffReleases,
  isRecent,
  listFollows,
  MusicBrainz,
  matchArtist,
  newReleases,
  ReleaseWatch,
  releaseTime,
  setFollow,
  syncAutoFollows,
} from "./releases";

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86_400_000;

test("an artist is matched only on an exact name and a sure score, never between two equal candidates", () => {
  const hurt = { id: "1", name: "Hurt", score: 100 };
  expect(matchArtist("hurt", [hurt, { id: "2", name: "Hurts", score: 92 }])?.id).toBe("1");
  expect(matchArtist("Hurt", [{ id: "2", name: "Hurts", score: 100 }])).toBeNull();
  expect(matchArtist("Hurt", [{ ...hurt, score: 70 }])).toBeNull();
  expect(
    matchArtist("Nirvana", [
      { id: "a", name: "Nirvana", score: 100 },
      { id: "b", name: "Nirvana", score: 100 },
    ]),
  ).toBeNull();
  expect(matchArtist("Ye", [{ id: "k", name: "Kanye West", score: 100, aliases: ["Ye"] }])?.id).toBe("k");
});

test("release dates: a bare year is too vague, only the last 90 days and the next 30 are new, known ones are skipped", () => {
  expect(releaseTime("2026")).toBeNull();
  expect(releaseTime("2026-10")).toBe(Date.UTC(2026, 9, 1));
  expect(isRecent("2026-09-01", NOW)).toBe(true);
  expect(isRecent("2026-01-01", NOW)).toBe(false);
  expect(isRecent("2026-12-24", NOW)).toBe(false);
  const fresh = { id: "n", title: "New", kind: "album", date: "2026-10-01" };
  expect(diffReleases(new Set(["old"]), [{ ...fresh, id: "old" }, fresh, fresh])).toEqual([fresh]);
});

test("the artists you play most are followed for you, an unfollow sticks, a pin stays", () => {
  const db = openLibraryDb(":memory:");
  const play = (artist: string, i: number) =>
    recordPlay(db, "s:u", "", { song: { id: `${artist}${i}`, artist }, started: NOW - (i + 1) * DAY, listened: 200, finished: true });
  for (let i = 0; i < 4; i++) {
    play("Hurt", i);
    play("Tool", i);
  }
  play("Abba", 0);
  syncAutoFollows(db, "s:u", NOW);
  expect(listFollows(db, "s:u")).toEqual([
    { name: "Hurt", status: "auto" },
    { name: "Tool", status: "auto" },
  ]);
  setFollow(db, "s:u", "Tool", "unfollowed");
  setFollow(db, "s:u", "Mitski", "pinned");
  syncAutoFollows(db, "s:u", NOW);
  expect(listFollows(db, "s:u")).toEqual([
    { name: "Mitski", status: "pinned" },
    { name: "Hurt", status: "auto" },
  ]);
});

test("a check resolves the artist once, stores only new release groups and lists the recent ones not in the library", async () => {
  const db = openLibraryDb(":memory:");
  const seen: string[] = [];
  const groups = [
    { id: "g1", title: "Brand New", "primary-type": "Album", "secondary-types": [], "first-release-date": "2026-10-10" },
    { id: "g2", title: "Live Thing", "primary-type": "Album", "secondary-types": ["Live"], "first-release-date": "2026-10-11" },
    { id: "g3", title: "Owned", "primary-type": "Album", "secondary-types": [], "first-release-date": "2026-10-12" },
    { id: "g4", title: "Ancient", "primary-type": "Album", "secondary-types": [], "first-release-date": "1999-01-01" },
  ];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push(url);
    expect(new Headers(init.headers).get("user-agent")).toContain("lodesong/");
    return Response.json(
      url.includes("/artist?")
        ? { artists: [{ id: "mb-hurt", name: "Hurt", score: 100 }] }
        : { "release-group-count": groups.length, "release-groups": groups },
    );
  }) as unknown as typeof fetch;
  const watch = new ReleaseWatch(db, new MusicBrainz("http://mb", fetcher, 0), { autoGet: false, handOff: null });
  setFollow(db, "s:u", "Hurt", "followed");
  db.run("create table idx_items (server text, kind text, id text, name text, data text)");
  db.query("insert into idx_items values ('s', 'album', 'x', 'Owned', ?)").run(JSON.stringify({ artist: "Hurt" }));

  await watch.check("hurt", "Hurt", NOW);
  await watch.check("hurt", "Hurt", NOW + 1000);
  expect(seen.filter((url) => url.includes("/artist?"))).toHaveLength(1);
  expect(seen.filter((url) => url.includes("/release-group?"))).toHaveLength(1);
  expect(newReleases(db, "s:u", NOW).map((release) => release.title)).toEqual(["Brand New"]);
});
