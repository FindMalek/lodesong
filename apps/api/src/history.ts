import type { Database } from "bun:sqlite";
import type { Play } from "@lodesong/shared/history";

// Navidrome only counts plays; skips (under 30 s, not finished) are the better signal for radio and shuffle.
// The song is kept as it was, so history survives a re-tag or a deleted file.

const SKIP_SECONDS = 30;

export function createHistoryTables(db: Database): void {
  db.run(`create table if not exists plays (
    id integer primary key,
    account text not null,
    song_id text not null,
    song text not null,
    started integer not null,
    listened integer not null,
    skipped integer not null,
    client text not null
  )`);
  if (
    !db
      .query<{ name: string }, []>("pragma table_info(plays)")
      .all()
      .some((column) => column.name === "key")
  )
    db.run("alter table plays add column key text");
  db.run("create unique index if not exists plays_by_key on plays (account, key)");
  db.run("create index if not exists plays_by_time on plays (account, started desc)");
}

export interface NewPlay {
  song: { id: string } & Record<string, unknown>;
  started: number;
  /** Seconds actually listened (seeking ahead doesn't count). */
  listened: number;
  finished: boolean;
  key?: string;
}

export function recordPlay(db: Database, account: string, client: string, play: NewPlay): void {
  const skipped = !play.finished && play.listened < SKIP_SECONDS;
  db.query(
    "insert into plays (account, song_id, song, started, listened, skipped, client, key) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict (account, key) do nothing",
  ).run(
    account,
    play.song.id,
    JSON.stringify(play.song),
    Math.round(play.started),
    Math.round(play.listened),
    skipped ? 1 : 0,
    client.slice(0, 64),
    play.key ?? null,
  );
}

export function readPlays(db: Database, account: string, before: number, limit: number): Play[] {
  return db
    .query<{ song: string; started: number; listened: number; skipped: number; client: string }, [string, number, number]>(
      "select song, started, listened, skipped, client from plays where account = ? and started < ? order by started desc limit ?",
    )
    .all(account, before, limit)
    .map((row) => ({
      song: JSON.parse(row.song),
      started: row.started,
      listened: row.listened,
      skipped: row.skipped === 1,
      client: row.client,
    }));
}
