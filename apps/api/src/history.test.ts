import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import { createHistoryTables, readPlays, recordPlay } from "./history";

test("a short listen that didn't finish is a skip; pages go back in time, per account", () => {
  const db = openLibraryDb(":memory:");
  const play = (id: string, started: number, listened: number, finished = false, account = "s:me") =>
    recordPlay(db, account, "lodesong@x", { song: { id, title: id }, started, listened, finished });
  play("a", 1000, 200, true);
  play("b", 2000, 12);
  play("c", 3000, 25, true);
  play("d", 4000, 31);
  play("theirs", 5000, 100, true, "s:you");

  const all = readPlays(db, "s:me", Date.now(), 10);
  expect(all.map((entry) => [entry.song.id, entry.skipped])).toEqual([
    ["d", false],
    ["c", false],
    ["b", true],
    ["a", false],
  ]);
  expect(readPlays(db, "s:me", 3000, 10).map((entry) => entry.song.id)).toEqual(["b", "a"]);
  expect(readPlays(db, "s:me", Date.now(), 1).map((entry) => entry.song.id)).toEqual(["d"]);
});

test("a retried play counts once, also on a table from before keys", () => {
  const db = new Database(":memory:", { strict: true });
  db.run(
    "create table plays (id integer primary key, account text not null, song_id text not null, song text not null, started integer not null, listened integer not null, skipped integer not null, client text not null)",
  );
  db.run(`insert into plays values (1, 's:me', 'old', '{"id":"old"}', 1000, 100, 0, '')`);
  createHistoryTables(db);
  createHistoryTables(db);

  const play = { song: { id: "new" }, started: 2000, listened: 100, finished: true };
  recordPlay(db, "s:me", "", { ...play, key: "k1" });
  recordPlay(db, "s:me", "", { ...play, key: "k1" });
  recordPlay(db, "s:you", "", { ...play, key: "k1" });
  // Clients that send no key keep being recorded every time.
  recordPlay(db, "s:me", "", { ...play, started: 3000 });
  recordPlay(db, "s:me", "", { ...play, started: 3000 });

  expect(readPlays(db, "s:me", Date.now(), 10).map((entry) => entry.started)).toEqual([3000, 3000, 2000, 1000]);
  expect(readPlays(db, "s:you", Date.now(), 10)).toHaveLength(1);
});
