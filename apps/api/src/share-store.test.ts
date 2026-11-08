import { expect, test } from "bun:test";
import { openLibraryDb } from "./db";
import type { CardData } from "./share-card";
import { SharedCards } from "./share-store";

const card = (title: string): CardData => ({ kind: "album", title, subtitle: "Artist", stats: "3 songs", covers: ["c-1"] });
const alice = { server: "home", user: "alice" };
const bob = { server: "home", user: "bob" };

function store(now: () => number = () => 1000, life = 10_000, max?: number) {
  const db = openLibraryDb(":memory:");
  return { db, cards: new SharedCards(db, now, life, max) };
}

test("each account keeps its own row for an item, and sharing again refreshes that row only", () => {
  const { cards } = store();
  const first = cards.save(alice, "album", "al-1", card("Old"));
  const other = cards.save(bob, "album", "al-1", card("Bob's"));
  expect(first?.id).not.toBe(other?.id);
  const again = cards.save(alice, "album", "al-1", card("New"));
  expect(again?.id).toBe(first?.id);
  expect(cards.find(first?.id ?? "")?.card.title).toBe("New");
  expect(cards.find(other?.id ?? "")?.card.title).toBe("Bob's");
  expect(cards.list(alice)).toHaveLength(1);
});

test("the same item id on another server is another row", () => {
  const { cards } = store();
  const here = cards.save(alice, "album", "al-1", card("Here"));
  const there = cards.save({ server: "away", user: "alice" }, "album", "al-1", card("There"));
  expect(here?.id).not.toBe(there?.id);
  expect(cards.find(here?.id ?? "")?.card.title).toBe("Here");
});

test("only the owner removes a share, and then it is gone", () => {
  const { cards } = store();
  const saved = cards.save(alice, "song", "s-1", { ...card("Song"), kind: "song" });
  const id = saved?.id ?? "";
  expect(cards.remove(bob, id)).toBe(false);
  expect(cards.remove({ server: "away", user: "alice" }, id)).toBe(false);
  expect(cards.find(id)).not.toBeNull();
  expect(cards.remove(alice, id)).toBe(true);
  expect(cards.find(id)).toBeNull();
  expect(cards.remove(alice, id)).toBe(false);
});

test("a share expires with its row and expired rows are cleaned up", () => {
  let now = 1000;
  const { cards, db } = store(() => now, 10_000);
  const id = cards.save(alice, "album", "al-1", card("A"))?.id ?? "";
  now = 10_999;
  expect(cards.find(id)).not.toBeNull();
  now = 11_001;
  expect(cards.find(id)).toBeNull();
  expect(cards.list(alice)).toHaveLength(0);
  expect(db.query("select count(*) as n from shared_cards").get()).toEqual({ n: 1 });
  now = 90_000;
  cards.save(bob, "album", "al-2", card("B"));
  expect(db.query("select count(*) as n from shared_cards").get()).toEqual({ n: 1 });
});

test("sharing again pushes the expiry out", () => {
  let now = 1000;
  const { cards } = store(() => now, 10_000);
  const id = cards.save(alice, "album", "al-1", card("A"))?.id ?? "";
  now = 8000;
  cards.save(alice, "album", "al-1", card("A"));
  now = 15_000;
  expect(cards.find(id)).not.toBeNull();
});

test("an account can share only so many items, but can still refresh and free a slot", () => {
  const { cards } = store(() => 1000, 10_000, 2);
  const first = cards.save(alice, "album", "al-1", card("A"));
  expect(cards.save(alice, "album", "al-2", card("B"))).not.toBeNull();
  expect(cards.save(alice, "album", "al-3", card("C"))).toBeNull();
  expect(cards.save(alice, "album", "al-1", card("A2"))?.id).toBe(first?.id);
  expect(cards.save(bob, "album", "al-3", card("C"))).not.toBeNull();
  cards.remove(alice, first?.id ?? "");
  expect(cards.save(alice, "album", "al-3", card("C"))).not.toBeNull();
});

test("the default limit is 200 shares per account", () => {
  const { cards } = store(() => 1000, 10_000, undefined);
  for (let index = 0; index < 200; index++) expect(cards.save(alice, "album", `al-${index}`, card("A"))).not.toBeNull();
  expect(cards.save(alice, "album", "al-200", card("A"))).toBeNull();
  expect(cards.save(bob, "album", "al-200", card("A"))).not.toBeNull();
});

test("a row that does not hold a valid card reads as no share instead of throwing", () => {
  const { cards, db } = store();
  for (const [id, json] of [
    ["bad-json", "{nope"],
    ["wrong-shape", '{"kind":"album","title":5,"stats":"","covers":[]}'],
    ["wrong-kind", JSON.stringify({ ...card("A"), kind: "song" })],
    ["long", JSON.stringify({ ...card("A"), title: "x".repeat(500) })],
    ["bad-cover", JSON.stringify({ ...card("A"), covers: ["../x"] })],
  ] as const) {
    db.run(
      "insert into shared_cards (id, server, account, kind, item, card, created, expires) values (?, 'home', 'alice', 'album', ?, ?, 0, 99999)",
      [id, id, json],
    );
    expect(cards.find(id)).toBeNull();
  }
  expect(cards.list(alice)).toHaveLength(0);
});

test("accounts are matched however the name was typed", () => {
  const { cards } = store();
  const id = cards.save({ server: "home", user: "Alice " }, "album", "al-1", card("A"))?.id ?? "";
  expect(cards.save({ server: "home", user: "ALICE" }, "album", "al-1", card("B"))?.id).toBe(id);
  expect(cards.list({ server: "home", user: "aLiCe" })).toHaveLength(1);
  expect(cards.remove({ server: "home", user: "ALICE" }, id)).toBe(true);
});

test("expired rows are gone as soon as the store opens", () => {
  const db = openLibraryDb(":memory:");
  new SharedCards(db, () => 1000, 10_000).save(alice, "album", "al-1", card("A"));
  new SharedCards(db, () => 50_000, 10_000);
  expect(db.query("select count(*) as n from shared_cards").get()).toEqual({ n: 0 });
});

test("a share keeps its art until it is shared again, removed or expired", () => {
  let now = 1000;
  const { cards, db } = store(() => now, 10_000);
  const id = cards.save(alice, "album", "al-1", card("A"), new Map([["c-1", new Uint8Array([1, 2, 3])]]))?.id ?? "";
  expect([...(cards.art(id).get("c-1") ?? [])]).toEqual([1, 2, 3]);
  cards.save(alice, "album", "al-1", card("A"), new Map([["c-2", new Uint8Array([4])]]));
  expect([...cards.art(id).keys()]).toEqual(["c-2"]);
  cards.remove(alice, id);
  expect(db.query("select count(*) as n from shared_art").get()).toEqual({ n: 0 });
  const later = cards.save(alice, "album", "al-2", card("B"), new Map([["c-1", new Uint8Array([1])]]))?.id ?? "";
  now = 99_000;
  cards.purge();
  expect(cards.art(later).size).toBe(0);
});

test("shares whose owner has had no login for the grace period are dropped, and a login in between saves them", () => {
  let now = 0;
  const { cards } = store(() => now, 1_000_000_000);
  const first = cards.save(alice, "album", "al-1", card("A"))?.id ?? "";
  const other = cards.save(bob, "album", "al-1", card("B"))?.id ?? "";
  const live = new Set(["bob"]);
  const check = () => cards.retire((owner) => live.has(owner.user), 1000);
  expect(check()).toBe(0);
  now = 1000;
  expect(check()).toBe(0);
  live.add("alice");
  now = 1500;
  expect(check()).toBe(0);
  live.delete("alice");
  now = 1600;
  expect(check()).toBe(0);
  now = 2600;
  expect(check()).toBe(0);
  now = 2601;
  expect(check()).toBe(1);
  expect(cards.find(first)).toBeNull();
  expect(cards.find(other)).not.toBeNull();
});

test("when the signing key changes every old share goes, and the same key keeps them", () => {
  const { cards } = store();
  expect(cards.adopt("one")).toBe(0);
  const id = cards.save(alice, "album", "al-1", card("A"), new Map([["c-1", new Uint8Array([1])]]))?.id ?? "";
  expect(cards.adopt("one")).toBe(0);
  expect(cards.find(id)).not.toBeNull();
  expect(cards.adopt("two")).toBe(1);
  expect(cards.find(id)).toBeNull();
  expect(cards.art(id).size).toBe(0);
  expect(cards.adopt("two")).toBe(0);
});

test("clear removes every share", () => {
  const { cards } = store();
  cards.save(alice, "album", "al-1", card("A"));
  cards.save(bob, "album", "al-1", card("A"));
  expect(cards.clear()).toBe(2);
  expect(cards.list(alice)).toHaveLength(0);
});
