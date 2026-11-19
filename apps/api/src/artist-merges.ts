import type { Database } from "bun:sqlite";
import { type ArtistMerge, MAX_ARTIST_MERGES } from "@lodesong/shared/artist-merges";

// The player folds artists whose names `normalize` to the same key into one. A row only exists for a key the account changed:
// split apart again, or shown under another spelling.

export function createArtistMergeTables(db: Database): void {
  db.run(`create table if not exists artist_merges (
    account text not null,
    key text not null,
    unmerged integer not null default 0,
    name text,
    primary key (account, key)
  )`);
}

export function listArtistMerges(db: Database, account: string): ArtistMerge[] {
  return db
    .query<{ key: string; unmerged: number; name: string | null }, [string]>(
      "select key, unmerged, name from artist_merges where account = ? order by key",
    )
    .all(account)
    .map((row) => ({ key: row.key, unmerged: row.unmerged === 1, name: row.name }));
}

/** False when this would be the account's 501st changed artist. */
export function setArtistMerge(db: Database, account: string, merge: ArtistMerge): boolean {
  if (!merge.unmerged && !merge.name) {
    db.query("delete from artist_merges where account = ? and key = ?").run(account, merge.key);
    return true;
  }
  const row = db
    .query<{ total: number; mine: number }, [string, string]>(
      "select count(*) as total, sum(key = ?2) as mine from artist_merges where account = ?1",
    )
    .get(account, merge.key);
  if (row && !row.mine && row.total >= MAX_ARTIST_MERGES) return false;
  db.query(
    `insert into artist_merges (account, key, unmerged, name) values (?, ?, ?, ?)
     on conflict (account, key) do update set unmerged = excluded.unmerged, name = excluded.name`,
  ).run(account, merge.key, merge.unmerged ? 1 : 0, merge.name);
  return true;
}
