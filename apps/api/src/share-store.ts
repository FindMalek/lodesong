import type { Database } from "bun:sqlite";
import type { CardData } from "./share-card";
import type { ShareKind } from "./share-token";

export function createShareTables(db: Database): void {
  db.run(`create table if not exists shared_cards (
    kind text not null,
    item text not null,
    server text not null,
    card text not null,
    updated integer not null,
    primary key (kind, item)
  )`);
}

export interface Shared {
  server: string;
  card: CardData;
}

/**
 * What a member chose to share: the card text and cover ids, saved when they copy the link. A link holder gets this
 * and nothing else, so no Navidrome login is needed to answer them.
 */
export class SharedCards {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  save(server: string, kind: ShareKind, item: string, card: CardData): void {
    this.db
      .query(
        "insert into shared_cards (kind, item, server, card, updated) values ($kind, $item, $server, $card, $updated) on conflict (kind, item) do update set server = $server, card = $card, updated = $updated",
      )
      .run({ server, kind, item, card: JSON.stringify(card), updated: this.now() });
  }

  find(kind: ShareKind, item: string): Shared | null {
    const row = this.db
      .query<{ server: string; card: string }, { kind: string; item: string }>(
        "select server, card from shared_cards where kind = $kind and item = $item",
      )
      .get({ kind, item });
    return row ? { server: row.server, card: JSON.parse(row.card) as CardData } : null;
  }
}
