import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { accountName } from "./account-name";
import { cardSchema } from "./card-schema";
import type { CardData } from "./share-card";
import { SHARE_LIFE_MS, type ShareKind } from "./share-token";

const MAX_SHARES = 200;

export function createShareTables(db: Database): void {
  if (db.query("select 1 from pragma_table_info('shared_cards') where name = 'lost'").get() === null) {
    db.run("drop table if exists shared_cards");
  }
  db.run(`create table if not exists shared_cards (
    id text primary key,
    server text not null,
    account text not null,
    kind text not null,
    item text not null,
    card text not null,
    created integer not null,
    expires integer not null,
    lost integer
  )`);
  db.run("create unique index if not exists shared_cards_owner on shared_cards (server, account, kind, item)");
  db.run("create index if not exists shared_cards_expires on shared_cards (expires)");
  db.run(
    "create table if not exists shared_art (share text not null, cover text not null, bytes blob not null, primary key (share, cover))",
  );
  db.run("create table if not exists share_meta (name text primary key, value text not null)");
}

export interface Owner {
  server: string;
  user: string;
}

export interface Shared {
  id: string;
  server: string;
  user: string;
  kind: ShareKind;
  item: string;
  card: CardData;
  created: number;
  expires: number;
}

interface Row {
  id: string;
  server: string;
  account: string;
  kind: ShareKind;
  item: string;
  card: string;
  created: number;
  expires: number;
}

function shared(row: Row): Shared | null {
  try {
    const card = cardSchema.safeParse(JSON.parse(row.card));
    if (!card.success || card.data.kind !== row.kind) return null;
    return { ...row, user: row.account, card: card.data };
  } catch {
    return null;
  }
}

/** What a member shared: one row per account and item. Removing the row ends every link made from it. */
export class SharedCards {
  private purgedAt = 0;

  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
    private readonly lifeMs: number = SHARE_LIFE_MS,
    private readonly max: number = MAX_SHARES,
  ) {
    this.purge();
  }

  purge(force = true): void {
    const time = this.now();
    if (!force && time - this.purgedAt < 60_000) return;
    this.purgedAt = time;
    this.db.query("delete from shared_cards where expires < $time").run({ time });
    this.sweep();
  }

  private sweep(): void {
    this.db.run("delete from shared_art where share not in (select id from shared_cards)");
  }

  /** Links are signed with a key from SESSION_SECRET: when that changes none can verify again, so the rows go too. */
  adopt(fingerprint: string): number {
    const known = this.db.query<{ value: string }, []>("select value from share_meta where name = 'fingerprint'").get();
    if (known?.value === fingerprint) return 0;
    const dropped = this.clear();
    this.db.query("insert or replace into share_meta (name, value) values ('fingerprint', $fingerprint)").run({ fingerprint });
    return dropped;
  }

  clear(): number {
    const dropped = this.db.run("delete from shared_cards").changes;
    this.sweep();
    return dropped;
  }

  /** Drops shares whose owner has had no live login for `graceMs`: nobody is left who could list or stop them. */
  retire(live: (owner: Owner) => boolean, graceMs: number): number {
    const time = this.now();
    const owners = this.db.query<{ server: string; account: string }, []>("select distinct server, account from shared_cards").all();
    for (const { server, account } of owners) {
      const where = { server, account };
      if (live({ server, user: account }))
        this.db.query("update shared_cards set lost = null where server = $server and account = $account").run(where);
      else
        this.db
          .query("update shared_cards set lost = $time where server = $server and account = $account and lost is null")
          .run({ ...where, time });
    }
    const dropped = this.db.query("delete from shared_cards where lost < $before").run({ before: time - graceMs }).changes;
    this.sweep();
    return dropped;
  }

  save(
    owner: Owner,
    kind: ShareKind,
    item: string,
    card: CardData,
    art: ReadonlyMap<string, Uint8Array> = new Map(),
  ): { id: string; expires: number } | null {
    this.purge(false);
    const time = this.now();
    const expires = time + this.lifeMs;
    const where = { server: owner.server, account: accountName(owner.user), kind, item };
    const existing = this.db
      .query<{ id: string }, typeof where>(
        "select id from shared_cards where server = $server and account = $account and kind = $kind and item = $item",
      )
      .get(where);
    const json = JSON.stringify(card);
    let id = existing?.id ?? "";
    if (existing) {
      this.db.query("update shared_cards set card = $json, expires = $expires, lost = null where id = $id").run({ json, expires, id });
    } else {
      const count = this.db
        .query<{ count: number }, { server: string; account: string }>(
          "select count(*) as count from shared_cards where server = $server and account = $account",
        )
        .get({ server: where.server, account: where.account });
      if ((count?.count ?? 0) >= this.max) return null;
      id = randomBytes(12).toString("base64url");
      this.db
        .query(
          "insert into shared_cards (id, server, account, kind, item, card, created, expires) values ($id, $server, $account, $kind, $item, $json, $time, $expires)",
        )
        .run({ id, ...where, json, time, expires });
    }
    this.db.query("delete from shared_art where share = $id").run({ id });
    for (const [cover, bytes] of art)
      this.db.query("insert into shared_art (share, cover, bytes) values ($id, $cover, $bytes)").run({ id, cover, bytes });
    return { id, expires };
  }

  art(id: string): Map<string, Uint8Array> {
    const rows = this.db
      .query<{ cover: string; bytes: Uint8Array }, [string]>("select cover, bytes from shared_art where share = ?")
      .all(id);
    return new Map(rows.map((row) => [row.cover, row.bytes]));
  }

  find(id: string): Shared | null {
    const row = this.db.query<Row, { id: string; time: number }>("select * from shared_cards where id = $id and expires >= $time").get({
      id,
      time: this.now(),
    });
    return row ? shared(row) : null;
  }

  list(owner: Owner): Shared[] {
    const rows = this.db
      .query<Row, { server: string; account: string; time: number }>(
        "select * from shared_cards where server = $server and account = $account and expires >= $time order by created desc",
      )
      .all({ server: owner.server, account: accountName(owner.user), time: this.now() });
    return rows.map(shared).filter((row): row is Shared => row !== null);
  }

  remove(owner: Owner, id: string): boolean {
    const removed =
      this.db.query("delete from shared_cards where id = $id and server = $server and account = $account").run({
        id,
        server: owner.server,
        account: accountName(owner.user),
      }).changes > 0;
    if (removed) this.sweep();
    return removed;
  }
}
