import type { Database } from "bun:sqlite";
import { normalize } from "@lodesong/shared/normalize";
import { ARTIST_CAP, artistPool, closest, roundRobin } from "./mix-pool";
import { rankByTaste, type Signal } from "./mix-scoring";
import { readPrefs } from "./prefs";
import type { StatsSong as Song } from "./stats";

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MIXES = 6;
const PER_MIX = 50;
const FAMILIAR = 0.6;
const MIN_PLAYS = 5;
const SESSION_MS = 2 * 3_600_000;
const MEMORY_DAYS = 3;
const KEEP_DAYS = 14;
const DISCOVER_SIZE = 30;
const DISCOVER_KNOWN = 0.6;
const DAYLIST_SIZE = 40;
const RADAR_DAYS = 30;
const RADAR_SIZE = 40;
const ON_THIS_DAY_SPREAD = 3;

export interface Mix {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

const SLOTS = [
  ["morning", 5, 12],
  ["afternoon", 12, 17],
  ["evening", 17, 22],
  ["night", 22, 29],
] as const;
export type Slot = (typeof SLOTS)[number][0];

export function slotOf(hour: number): Slot {
  const h = hour < 5 ? hour + 24 : hour;
  return SLOTS.find(([, from, to]) => h >= from && h < to)?.[0] ?? "night";
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Day 0 (1970-01-01) was a Thursday. */
const weekdayOf = (day: number) => (day + 4) % 7;
/** The last Friday on or before `day`: Discover Weekly turns over then. */
const lastFriday = (day: number) => day - ((weekdayOf(day) - 5 + 7) % 7);

/** Seeded, so a day's mixes are the same on every device and every reload. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export const keyOf = (song: { artist?: string; title?: string }) => `${normalize(song.artist ?? "")}\u0000${normalize(song.title ?? "")}`;

export interface Listening {
  plays: { song: Song; started: number }[];
  byArtist: Map<string, Song[]>;
  counts: Map<string, number>;
  playedKeys: Set<string>;
  together: Map<string, Map<string, number>>;
  signals: Map<string, Signal>;
  liked: Set<string>;
  now: number;
}

/**
 * Plays are matched by artist and title, not id: Navidrome gives a song a new id when its file moves,
 * and genre tags are too often missing to group by.
 */
export function listening(db: Database, server: string, account: string, now: number, likedIds: Set<string> = new Set()): Listening | null {
  const rows = db
    .query<{ song: string; started: number; skipped: number }, [string, number]>(
      "select song, started, skipped from plays where account = ? and started >= ? order by started",
    )
    .all(account, now - WINDOW_DAYS * DAY)
    .map((row) => ({ song: JSON.parse(row.song) as Song, started: row.started, skipped: row.skipped === 1 }));
  const plays = rows.filter((row) => !row.skipped);
  if (!plays.length) return null;
  const never = new Set(
    readPrefs(db, account)
      .songs.filter((pref) => pref.never)
      .map((pref) => pref.id),
  );
  const library = db
    .query<{ data: string }, [string]>("select data from idx_items where server = ? and kind = 'song'")
    .all(server)
    .map((row) => JSON.parse(row.data) as Song);
  const neverKeys = new Set(library.filter((song) => never.has(song.id)).map(keyOf));
  const liked = new Set(library.filter((song) => likedIds.has(song.id)).map(keyOf));
  const added = (song: Song) => Date.parse(typeof song.created === "string" ? song.created : "") || 0;
  const newest = new Map<string, Song>();
  for (const song of library) {
    const key = keyOf(song);
    if (!song.artist || neverKeys.has(key)) continue;
    const kept = newest.get(key);
    if (!kept || added(song) > added(kept)) newest.set(key, song);
  }
  const byArtist = new Map<string, Song[]>();
  for (const song of newest.values()) {
    const artist = normalize(song.artist ?? "");
    const songs = byArtist.get(artist);
    if (songs) songs.push(song);
    else byArtist.set(artist, [song]);
  }
  const counts = new Map<string, number>();
  const playedKeys = new Set<string>();
  const together = new Map<string, Map<string, number>>();
  const signals = new Map<string, Signal>();
  for (const row of rows) {
    const key = keyOf(row.song);
    const signal = signals.get(key) ?? { plays: 0, skips: 0, last: 0 };
    if (row.skipped) signal.skips++;
    else {
      signal.plays++;
      signal.last = Math.max(signal.last, row.started);
    }
    signals.set(key, signal);
  }
  for (const [index, play] of plays.entries()) {
    if (!play.song.artist) continue;
    const artist = normalize(play.song.artist);
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
    playedKeys.add(keyOf(play.song));
    for (let j = index + 1; j < plays.length; j++) {
      const next = plays[j];
      if (!next || next.started - play.started > SESSION_MS) break;
      const other = next.song.artist ? normalize(next.song.artist) : "";
      if (!other || other === artist) continue;
      for (const [a, b] of [
        [artist, other],
        [other, artist],
      ] as const) {
        const row = together.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        together.set(a, row);
      }
    }
  }
  return { plays, byArtist, counts, playedKeys, together, signals, liked, now };
}

/** Songs not in `avoid` first, best taste first in each half; the avoided ones only fill what's left, so a small library still gets a full mix. */
function preferring(songs: Song[], avoid: Set<string>, l: Listening, random: () => number): Song[] {
  const best = (group: Song[]) => rankByTaste(group, keyOf, l, random);
  return [...best(songs.filter((song) => !avoid.has(keyOf(song)))), ...best(songs.filter((song) => avoid.has(keyOf(song))))];
}

export function blend(l: Listening, artists: string[], size: number, random: () => number, avoid: Set<string> = new Set()): Song[] {
  const queues = (played: boolean) =>
    artists.map((artist) =>
      preferring(
        (l.byArtist.get(artist) ?? []).filter((song) => l.playedKeys.has(keyOf(song)) === played),
        avoid,
        l,
        random,
      ),
    );
  const [known, unknown] = [queues(true), queues(false)];
  const cap = Math.ceil(size * ARTIST_CAP);
  const taken = artists.map(() => 0);
  const familiar = roundRobin(known, Math.round(size * FAMILIAR), cap, taken);
  const fresh = roundRobin(unknown, size - familiar.length, cap, taken);
  const rest = size - familiar.length - fresh.length;
  const topUp = [...roundRobin(unknown, rest, Infinity, taken), ...roundRobin(known, rest, Infinity, taken)].slice(0, Math.max(rest, 0));
  return shuffle([...familiar, ...fresh, ...topUp], random);
}

const artistNames = (l: Listening, artists: string[]) =>
  artists
    .slice(0, 3)
    .map((artist) => l.byArtist.get(artist)?.[0]?.artist ?? artist)
    .join(", ");

export function createMixTables(db: Database): void {
  db.run(`create table if not exists mix_days (
    account text not null,
    day integer not null,
    id text not null,
    description text not null,
    keys text not null,
    primary key (account, day, id)
  )`);
}

function remembered(
  db: Database,
  account: string,
  from: number,
  to: number,
): { day: number; id: string; description: string; keys: string[] }[] {
  return db
    .query<{ day: number; id: string; description: string; keys: string }, [string, number, number]>(
      "select day, id, description, keys from mix_days where account = ? and day >= ? and day <= ? order by id",
    )
    .all(account, from, to)
    .map((row) => ({ ...row, keys: parseKeys(row.keys) }));
}

function parseKeys(text: string): string[] {
  try {
    const keys: unknown = JSON.parse(text);
    return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

/** A client's day, kept within two days of the server's: it keys what is stored and pruned. */
export function nearToday(day: number, now: number): number {
  const today = Math.floor(now / DAY);
  return Math.abs(day - today) <= 2 ? day : today;
}

function remember(db: Database, account: string, day: number, mixes: Mix[]): void {
  db.transaction(() => {
    db.query("delete from mix_days where account = ? and (day < ? or day = ?)").run(account, day - KEEP_DAYS, day);
    for (const mix of mixes)
      db.query("insert or replace into mix_days (account, day, id, description, keys) values (?, ?, ?, ?, ?)").run(
        account,
        day,
        mix.id,
        mix.description,
        JSON.stringify([...new Set(mix.songs.map(keyOf))]),
      );
  })();
}

/** The artists you play most, reshuffled a little each week so the six mixes aren't always the same six. */
function seedsFor(l: Listening, account: string, day: number): string[] {
  const week = Math.floor((day + 3) / 7);
  return [...l.counts.entries()]
    .filter(([artist, n]) => n >= MIN_PLAYS && l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .map(([artist, n]) => ({ artist, score: n * (0.5 + seeded(`${account}:seed:${week}:${artist}`)()) }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.artist);
}

type Stored = { id: string; description: string; keys: string[] };

function fromStored(l: Listening, rows: Stored[]): Mix[] {
  const library = new Map<string, Song>();
  for (const songs of l.byArtist.values()) for (const song of songs) if (!library.has(keyOf(song))) library.set(keyOf(song), song);
  return rows
    .map((row) => ({
      id: row.id,
      name: row.id.replace("daily-", "daily mix "),
      description: row.description,
      songs: row.keys.map((key) => library.get(key)).filter((song): song is Song => Boolean(song)),
    }))
    .filter((mix) => mix.songs.length > 0);
}

function daily(db: Database, l: Listening, account: string, day: number): Mix[] {
  const stored = fromStored(l, remembered(db, account, day, day));
  if (stored.length >= MIXES) return stored;
  const avoid = new Set(remembered(db, account, day - MEMORY_DAYS, day - 1).flatMap((row) => row.keys));
  const used = new Set<string>();
  const mixes: Mix[] = [];
  for (const seed of seedsFor(l, account, day)) {
    if (mixes.length === MIXES) break;
    if (used.has(seed)) continue;
    for (const artist of [seed, ...closest(l, seed)]) used.add(artist);
    const artists = artistPool(l, seed);
    mixes.push({
      id: `daily-${mixes.length + 1}`,
      name: `daily mix ${mixes.length + 1}`,
      description: artistNames(l, artists),
      songs: blend(l, artists, PER_MIX, seeded(`${account}:${day}:${seed}`), avoid),
    });
  }
  if (stored.length >= mixes.length) return stored;
  remember(db, account, day, mixes);
  return fromStored(
    l,
    mixes.map((mix) => ({ id: mix.id, description: mix.description, keys: [...new Set(mix.songs.map(keyOf))] })),
  );
}

function discover(l: Listening, account: string, friday: number, boosted: Set<string>): Mix | null {
  const random = seeded(`${account}:discover:${friday}`);
  const unplayed = (artist: string) => (l.byArtist.get(artist) ?? []).filter((song) => !l.playedKeys.has(keyOf(song)));
  const liked = [...l.counts.entries()]
    .sort((a, b) => Number(boosted.has(b[0])) - Number(boosted.has(a[0])) || b[1] - a[1])
    .map(([artist]) => artist);
  const known: Song[] = [];
  // Round-robin over your artists, best first, so one big discography doesn't take every slot.
  const queues = liked.map((artist) => shuffle(unplayed(artist), random)).filter((queue) => queue.length);
  const knownSize = Math.round(DISCOVER_SIZE * DISCOVER_KNOWN);
  for (let round = 0; known.length < knownSize && queues.some((queue) => queue.length > round); round++)
    for (const queue of queues) {
      const song = queue[round];
      if (song && known.length < knownSize) known.push(song);
    }
  const strangers = [...l.byArtist.keys()].filter((artist) => !l.counts.has(artist));
  const fresh = shuffle(strangers, random)
    .map((artist) => shuffle(l.byArtist.get(artist) ?? [], random)[0])
    .filter((song): song is Song => Boolean(song))
    .slice(0, DISCOVER_SIZE - known.length);
  const songs = shuffle([...known, ...fresh], random);
  if (!songs.length) return null;
  return {
    id: "discover-weekly",
    name: "discover weekly",
    description: "songs you own and never played, picked for you every friday",
    songs,
  };
}

function releaseRadar(l: Listening, now: number): Mix | null {
  const since = now - RADAR_DAYS * DAY;
  const fresh = [...l.byArtist.entries()]
    .filter(([artist]) => l.counts.has(artist))
    .flatMap(([, songs]) => songs)
    .map((song) => ({ song, added: Date.parse(typeof song.created === "string" ? song.created : "") }))
    .filter((item) => item.added >= since)
    .sort((a, b) => b.added - a.added || (Number(a.song.track) || 0) - (Number(b.song.track) || 0))
    .slice(0, RADAR_SIZE)
    .map((item) => item.song);
  if (!fresh.length) return null;
  const artists = [...new Set(fresh.map((song) => normalize(song.artist ?? "")))];
  return { id: "release-radar", name: "release radar", description: `new in your library: ${artistNames(l, artists)}`, songs: fresh };
}

function onThisDay(db: Database, l: Listening, account: string, now: number): Mix | null {
  const center = now - 365 * DAY;
  const rows = db
    .query<{ song: string }, [string, number, number]>(
      "select song from plays where account = ? and skipped = 0 and started >= ? and started < ?",
    )
    .all(account, center - ON_THIS_DAY_SPREAD * DAY, center + ON_THIS_DAY_SPREAD * DAY);
  if (!rows.length) return null;
  const library = new Map<string, Song>();
  for (const songs of l.byArtist.values()) for (const song of songs) library.set(keyOf(song), song);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(JSON.parse(row.song) as Song);
    if (library.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const songs = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([key]) => library.get(key) as Song);
  if (!songs.length) return null;
  const date = new Date(center).toLocaleDateString("en", { month: "long", day: "numeric" }).toLowerCase();
  return { id: "on-this-day", name: "on this day", description: `what you played around ${date} last year`, songs };
}

function daylist(l: Listening, account: string, day: number, slot: Slot, tzMinutes: number): Mix | null {
  const counts = new Map<string, number>();
  for (const play of l.plays) {
    if (!play.song.artist) continue;
    const hour = Math.floor(((play.started - tzMinutes * 60_000) % DAY) / 3_600_000);
    if (slotOf((hour + 24) % 24) !== slot) continue;
    const artist = normalize(play.song.artist);
    counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }
  const artists = [...counts.entries()]
    .filter(([artist]) => l.byArtist.has(artist))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist]) => artist);
  if (!artists.length) return null;
  const songs = blend(l, artists, DAYLIST_SIZE, seeded(`${account}:${day}:${slot}`));
  return { id: "daylist", name: "daylist", description: `${WEEKDAYS[weekdayOf(day)]} ${slot}: ${artistNames(l, artists)}`, songs };
}

/** `day` is the browser's local days since the epoch, `hour` its local hour, `tzMinutes` its `getTimezoneOffset()`. */
export function madeForYou(
  db: Database,
  server: string,
  account: string,
  { day, hour, tzMinutes }: { day: number; hour: number; tzMinutes: number },
  now = Date.now(),
  boosted: Set<string> = new Set(),
  liked: Set<string> = new Set(),
): Mix[] {
  const l = listening(db, server, account, now, liked);
  if (!l) return [];
  return [
    ...daily(db, l, account, day),
    discover(l, account, lastFriday(day), boosted),
    releaseRadar(l, now),
    onThisDay(db, l, account, now),
    daylist(l, account, day, slotOf(hour), tzMinutes),
  ].filter((mix): mix is Mix => mix !== null);
}

export function mixesVersion(db: Database, server: string, account: string): string {
  const plays = db
    .query<{ count: number; last: number | null }, [string]>("select count(*) as count, max(rowid) as last from plays where account = ?")
    .get(account);
  // The index tables exist only once the index has run.
  const synced = (() => {
    try {
      return db.query<{ value: string }, [string]>("select value from meta where key = ?").get(`index-last-sync:${server}`)?.value ?? "";
    } catch {
      return "";
    }
  })();
  const never = db
    .query<{ ids: string | null }, [string]>("select group_concat(song_id) as ids from song_prefs where account = ? and never = 1")
    .get(account)?.ids;
  return Bun.hash(`${plays?.count}:${plays?.last}:${synced}:${never ?? ""}`).toString(36);
}

export function dailyMixes(
  db: Database,
  server: string,
  account: string,
  day: number,
  now = Date.now(),
  liked: Set<string> = new Set(),
): Mix[] {
  const l = listening(db, server, account, now, liked);
  return l ? daily(db, l, account, day) : [];
}
