import type { Database } from "bun:sqlite";
import { normalize } from "@lodesong/shared/normalize";
import type { Follow, FollowStatus, NewRelease } from "@lodesong/shared/releases";
import { VERSION } from "./health";

// Artists you play are followed for you; a weekly check asks MusicBrainz what they released lately. Nothing is
// downloaded unless Lyterion is set up and handing over is switched on (or you press "get it" on a release).

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const AHEAD_DAYS = 30;
const AUTO_FOLLOWS = 15;
const AUTO_MIN_PLAYS = 3;
const MIN_SCORE = 90;
const RETRY_UNMATCHED_MS = 30 * DAY;
const WEEK_MS = 7 * DAY;
const CHECK_EVERY_MS = 6 * 3_600_000;
const PAGE = 100;
const MAX_PAGES = 3;
const AUTO_GET_PER_RUN = 10;
const AUTO_GET_DAYS = 45;
const ANSWER_TIMEOUT_MS = 30_000;

export interface MbArtist {
  id: string;
  name: string;
  score: number;
  aliases?: string[];
}

export interface ReleaseGroup {
  id: string;
  title: string;
  kind: string;
  date: string;
}

/** An artist only counts as found when a name or alias matches exactly and MusicBrainz is sure; two equally good matches mean none. */
export function matchArtist(name: string, candidates: MbArtist[]): MbArtist | null {
  const wanted = normalize(name);
  if (!wanted) return null;
  const exact = candidates
    .filter(
      (candidate) => candidate.score >= MIN_SCORE && [candidate.name, ...(candidate.aliases ?? [])].some((n) => normalize(n) === wanted),
    )
    .sort((a, b) => b.score - a.score);
  const [best, second] = exact;
  if (!best) return null;
  return second && best.score - second.score < 5 ? null : best;
}

/** "2026-03-14" and "2026-03" are dates; a bare year is too vague to call something new. */
export function releaseTime(date: string): number | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1));
  return Number.isNaN(time) ? null : time;
}

export function diffReleases(known: Set<string>, fetched: ReleaseGroup[]): ReleaseGroup[] {
  const seen = new Set<string>();
  return fetched.filter((release) => {
    if (known.has(release.id) || seen.has(release.id) || !release.title) return false;
    seen.add(release.id);
    return true;
  });
}

export function isRecent(date: string, now: number): boolean {
  const time = releaseTime(date);
  return time !== null && time >= now - WINDOW_DAYS * DAY && time <= now + AHEAD_DAYS * DAY;
}

export function createReleaseTables(db: Database): void {
  db.run(`create table if not exists followed_artists (
    account text not null,
    key text not null,
    name text not null,
    status text not null,
    primary key (account, key)
  )`);
  db.run(`create table if not exists artist_mbids (
    key text primary key,
    name text not null,
    mbid text,
    checked integer not null,
    releases_checked integer not null default 0
  )`);
  db.run(`create table if not exists release_groups (
    id text primary key,
    mbid text not null,
    title text not null,
    kind text not null,
    date text not null,
    seen integer not null,
    handed integer,
    recording_id text
  )`);
  db.run("create index if not exists release_groups_by_artist on release_groups (mbid)");
  db.run("create table if not exists meta (key text primary key, value text not null)");
}

/** The artists you play most, by plays in the last 90 days. Followed for you unless you turned that artist off. */
export function syncAutoFollows(db: Database, account: string, now: number): void {
  const counts = new Map<string, { name: string; plays: number }>();
  for (const row of db
    .query<{ song: string }, [string, number]>("select song from plays where account = ? and skipped = 0 and started >= ?")
    .all(account, now - 90 * DAY)) {
    const artist = (JSON.parse(row.song) as { artist?: string }).artist;
    const key = artist ? normalize(artist) : "";
    if (!artist || !key) continue;
    const entry = counts.get(key) ?? { name: artist, plays: 0 };
    entry.plays += 1;
    counts.set(key, entry);
  }
  const top = [...counts.entries()]
    .filter(([, entry]) => entry.plays >= AUTO_MIN_PLAYS)
    .sort((a, b) => b[1].plays - a[1].plays)
    .slice(0, AUTO_FOLLOWS);
  db.transaction(() => {
    db.query("delete from followed_artists where account = ? and status = 'auto'").run(account);
    for (const [key, entry] of top)
      db.query("insert or ignore into followed_artists (account, key, name, status) values (?, ?, ?, 'auto')").run(
        account,
        key,
        entry.name,
      );
  })();
}

export function listFollows(db: Database, account: string): Follow[] {
  return db
    .query<Follow, [string]>(
      "select name, status from followed_artists where account = ? and status != 'unfollowed' order by status = 'pinned' desc, name collate nocase",
    )
    .all(account);
}

export function setFollow(db: Database, account: string, name: string, status: FollowStatus | "unfollowed"): void {
  const key = normalize(name);
  if (!key) return;
  db.query(
    "insert into followed_artists (account, key, name, status) values (?, ?, ?, ?) on conflict (account, key) do update set status = excluded.status",
  ).run(account, key, name.trim().slice(0, 200), status);
}

const albumsOwned = (db: Database, artist: string, title: string): boolean => {
  try {
    const wanted = normalize(artist);
    return db
      .query<{ data: string }, [string]>("select data from idx_items where kind = 'album' and name = ? collate nocase")
      .all(title)
      .some((row) => normalize(String((JSON.parse(row.data) as { artist?: string }).artist ?? "")) === wanted);
  } catch {
    return false;
  }
};

interface ReleaseRow {
  id: string;
  title: string;
  kind: string;
  date: string;
  handed: number | null;
  artist: string;
}

function releaseRows(db: Database, account: string): ReleaseRow[] {
  return db
    .query<ReleaseRow, [string]>(
      `select r.id, r.title, r.kind, r.date, r.handed, f.name as artist
       from release_groups r
       join artist_mbids m on m.mbid = r.mbid
       join followed_artists f on f.key = m.key and f.account = ?
       where f.status != 'unfollowed'`,
    )
    .all(account);
}

/** Recent releases by artists you follow that aren't in your library, newest first. */
export function newReleases(db: Database, account: string, now: number): Omit<NewRelease, "canGet">[] {
  return releaseRows(db, account)
    .filter((row) => isRecent(row.date, now) && !albumsOwned(db, row.artist, row.title))
    .sort((a, b) => (releaseTime(b.date) ?? 0) - (releaseTime(a.date) ?? 0))
    .slice(0, 30)
    .map((row) => ({
      id: row.id,
      artist: row.artist,
      title: row.title,
      kind: row.kind,
      date: row.date,
      url: `https://musicbrainz.org/release-group/${row.id}`,
      requested: row.handed !== null,
    }));
}

export function artistsWithReleases(db: Database, account: string, now: number): Set<string> {
  return new Set(newReleases(db, account, now).map((release) => normalize(release.artist)));
}

export function releasesVersion(db: Database, account: string): string {
  const row = db
    .query<{ n: number; last: number | null }, [string]>(
      `select count(*) as n, max(r.seen) as last from release_groups r
       join artist_mbids m on m.mbid = r.mbid
       join followed_artists f on f.key = m.key and f.account = ?
       where f.status != 'unfollowed'`,
    )
    .get(account);
  return `${row?.n ?? 0}.${row?.last ?? 0}`;
}

export class MusicBrainz {
  private last = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly base: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly gapMs = 1100,
  ) {}

  /** One request at a time, a second apart: MusicBrainz's limit for anonymous clients. */
  private get<T>(path: string): Promise<T | null> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await Bun.sleep(wait);
      this.last = Date.now();
      const response = await this.fetcher(`${this.base}/ws/2/${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
        headers: { "user-agent": `lodesong/${VERSION} ( https://github.com/FindMalek/lodesong )`, accept: "application/json" },
        signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
      }).catch(() => null);
      return response?.ok ? ((await response.json().catch(() => null)) as T | null) : null;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async searchArtist(name: string): Promise<MbArtist[] | null> {
    const query = encodeURIComponent(`artist:"${name.replace(/["\\]/g, " ")}"`);
    const answer = await this.get<{ artists?: { id: string; name: string; score: number; aliases?: { name: string }[] }[] }>(
      `artist?query=${query}&limit=5`,
    );
    return (
      answer?.artists?.map((artist) => ({
        id: artist.id,
        name: artist.name,
        score: artist.score,
        aliases: artist.aliases?.map((alias) => alias.name),
      })) ?? null
    );
  }

  async releaseGroups(mbid: string): Promise<ReleaseGroup[] | null> {
    const groups: ReleaseGroup[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await this.get<{
        "release-group-count"?: number;
        "release-groups"?: {
          id: string;
          title: string;
          "primary-type"?: string;
          "secondary-types"?: string[];
          "first-release-date"?: string;
        }[];
      }>(`release-group?artist=${encodeURIComponent(mbid)}&type=album|ep|single&limit=${PAGE}&offset=${page * PAGE}`);
      if (!answer) return page ? groups : null;
      for (const group of answer["release-groups"] ?? [])
        if (!group["secondary-types"]?.length)
          groups.push({
            id: group.id,
            title: group.title,
            kind: (group["primary-type"] ?? "album").toLowerCase(),
            date: group["first-release-date"] ?? "",
          });
      if ((answer["release-group-count"] ?? 0) <= (page + 1) * PAGE) break;
    }
    return groups;
  }
}

/** Lyterion's add-a-song path, with a release as the name to look for. Resolves to its recording id. */
export type HandOff = (input: string) => Promise<string | null>;

export function lyterionHandOff(lyterion: { url: string; token: string }, fetcher: typeof fetch = fetch): HandOff {
  return async (input) => {
    const response = await fetcher(`${lyterion.url}/api/rpc/api-reference/player/wishlist`, {
      method: "POST",
      headers: { "x-lyterion-token": lyterion.token, "content-type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    const answer = (await response.json().catch(() => null)) as { recordingId?: unknown } | null;
    return typeof answer?.recordingId === "string" ? answer.recordingId : null;
  };
}

export class ReleaseWatch {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly mb: MusicBrainz,
    private readonly options: { autoGet: boolean; handOff: HandOff | null },
  ) {
    createReleaseTables(db);
  }

  get canGet(): boolean {
    return this.options.handOff !== null;
  }

  start(): void {
    const first = setTimeout(() => void this.runDue(), 30_000);
    first.unref();
    this.timer = setInterval(() => void this.runDue(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async runDue(now = Date.now()): Promise<void> {
    const last = Number(this.db.query<{ value: string }, []>("select value from meta where key = 'releases-last-run'").get()?.value ?? 0);
    if (now - last >= WEEK_MS) await this.run(now);
  }

  async run(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const { account } of this.db.query<{ account: string }, []>("select distinct account from plays").all())
        syncAutoFollows(this.db, account, now);
      const artists = this.db
        .query<{ key: string; name: string }, []>(
          "select key, min(name) as name from followed_artists where status != 'unfollowed' group by key",
        )
        .all();
      for (const artist of artists) await this.check(artist.key, artist.name, now);
      this.db.query("insert or replace into meta (key, value) values ('releases-last-run', ?)").run(String(now));
      await this.autoGet(now);
    } finally {
      this.running = false;
    }
  }

  async check(key: string, name: string, now = Date.now()): Promise<void> {
    let row = this.db
      .query<{ mbid: string | null; checked: number; releases_checked: number }, [string]>(
        "select mbid, checked, releases_checked from artist_mbids where key = ?",
      )
      .get(key);
    if (!row || (!row.mbid && now - row.checked > RETRY_UNMATCHED_MS)) {
      const candidates = await this.mb.searchArtist(name);
      if (!candidates) return;
      const mbid = matchArtist(name, candidates)?.id ?? null;
      this.db
        .query(
          "insert into artist_mbids (key, name, mbid, checked) values (?, ?, ?, ?) on conflict (key) do update set mbid = excluded.mbid, checked = excluded.checked",
        )
        .run(key, name, mbid, now);
      row = { mbid, checked: now, releases_checked: row?.releases_checked ?? 0 };
    }
    if (!row.mbid || now - row.releases_checked < DAY) return;
    const fetched = await this.mb.releaseGroups(row.mbid);
    if (!fetched) return;
    const known = new Set(
      this.db
        .query<{ id: string }, [string]>("select id from release_groups where mbid = ?")
        .all(row.mbid)
        .map((stored) => stored.id),
    );
    const mbid = row.mbid;
    this.db.transaction(() => {
      for (const release of diffReleases(known, fetched))
        this.db
          .query("insert or ignore into release_groups (id, mbid, title, kind, date, seen) values (?, ?, ?, ?, ?, ?)")
          .run(release.id, mbid, release.title, release.kind, release.date, now);
      this.db.query("update artist_mbids set releases_checked = ? where key = ?").run(now, key);
    })();
  }

  /** Follows from the player: look the artist up straight away instead of waiting for the week. */
  refresh(name: string): void {
    void this.check(normalize(name), name).catch(() => undefined);
  }

  async get(id: string): Promise<boolean> {
    if (!this.options.handOff) return false;
    const row = this.db
      .query<{ title: string; artist: string }, [string]>(
        "select r.title, m.name as artist from release_groups r join artist_mbids m on m.mbid = r.mbid where r.id = ? limit 1",
      )
      .get(id);
    if (!row) return false;
    const recording = await this.options.handOff(`${row.artist} - ${row.title}`);
    if (!recording) return false;
    this.db.query("update release_groups set handed = ?, recording_id = ? where id = ?").run(Date.now(), recording, id);
    return true;
  }

  private async autoGet(now: number): Promise<void> {
    if (!this.options.autoGet || !this.options.handOff) return;
    const accounts = this.db.query<{ account: string }, []>("select distinct account from followed_artists").all();
    const wanted = new Map<string, ReleaseRow>();
    for (const { account } of accounts)
      for (const row of releaseRows(this.db, account)) {
        const time = releaseTime(row.date);
        if (
          row.handed === null &&
          time !== null &&
          time <= now &&
          time >= now - AUTO_GET_DAYS * DAY &&
          !albumsOwned(this.db, row.artist, row.title)
        )
          wanted.set(row.id, row);
      }
    for (const id of [...wanted.keys()].slice(0, AUTO_GET_PER_RUN)) await this.get(id);
  }
}
