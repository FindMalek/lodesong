import type { Database } from "bun:sqlite";
import type { Cover } from "./folder-cover";

// A cover the account chose over Navidrome's, per cover id. The hash rides in the cover url, so a new choice is a new url.

export const MAX_COVER_OVERRIDES = 500;

export function createCoverOverrideTable(db: Database): void {
  db.run(`create table if not exists cover_overrides (
    account text not null,
    cover_id text not null,
    type text not null,
    hash text not null,
    bytes blob not null,
    primary key (account, cover_id)
  )`);
}

export function listCoverOverrides(db: Database, account: string): { id: string; version: string }[] {
  return db
    .query<{ id: string; version: string }, [string]>("select cover_id as id, hash as version from cover_overrides where account = ?")
    .all(account);
}

export function coverOverride(db: Database, account: string, id: string): Cover | null {
  return db
    .query<Cover, [string, string]>("select type, hash, bytes from cover_overrides where account = ? and cover_id = ?")
    .get(account, id);
}

/** False when this would be the account's 501st override. */
export function setCoverOverride(db: Database, account: string, id: string, picture: Cover): boolean {
  const row = db
    .query<{ total: number; mine: number }, [string, string]>(
      "select count(*) as total, coalesce(sum(cover_id = ?2), 0) as mine from cover_overrides where account = ?1",
    )
    .get(account, id);
  if (row && !row.mine && row.total >= MAX_COVER_OVERRIDES) return false;
  db.query("insert or replace into cover_overrides (account, cover_id, type, hash, bytes) values (?, ?, ?, ?, ?)").run(
    account,
    id,
    picture.type,
    picture.hash,
    picture.bytes,
  );
  return true;
}

export function removeCoverOverride(db: Database, account: string, id: string): void {
  db.query("delete from cover_overrides where account = ? and cover_id = ?").run(account, id);
}
