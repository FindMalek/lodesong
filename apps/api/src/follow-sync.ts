import type { Database } from "bun:sqlite";
import { normalize } from "@lodesong/shared/normalize";
import { createReleaseTables, setFollow } from "./releases";

// Follows every artist you follow on Spotify, as Lyterion has them. It only ever adds: artists you followed here stay,
// and one you unfollowed here is not followed again.

const DAY = 86_400_000;
const CHECK_EVERY_MS = 6 * 3_600_000;
const ASK_TIMEOUT_MS = 30_000;
const LAST_RUN = "follow-sync-last-run";

interface SpotifyArtist {
  name: string;
  id?: string;
}

export interface SyncResult {
  added: number;
  total: number;
}

export type Lyterion = { url: string; token: string };

async function fetchFollowedArtists(lyterion: Lyterion, fetcher: typeof fetch = fetch): Promise<SpotifyArtist[] | null> {
  const response = await fetcher(`${lyterion.url}/api/rpc/api-reference/player/followed-artists`, {
    headers: { "x-lyterion-token": lyterion.token },
    signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { artists?: unknown } | null;
  if (!Array.isArray(body?.artists)) return null;
  const artists: SpotifyArtist[] = [];
  for (const entry of body.artists as { name?: unknown; id?: unknown }[]) {
    if (typeof entry?.name !== "string" || !entry.name.trim()) continue;
    artists.push({ name: entry.name, ...(typeof entry.id === "string" ? { id: entry.id } : {}) });
  }
  return artists;
}

function applySpotifyFollows(db: Database, account: string, artists: SpotifyArtist[]): number {
  const seen = new Set<string>();
  let added = 0;
  db.transaction(() => {
    for (const { name } of artists) {
      const key = normalize(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const status = db
        .query<{ status: string }, [string, string]>("select status from followed_artists where account = ? and key = ?")
        .get(account, key)?.status;
      if (status === "unfollowed" || status === "followed" || status === "pinned") continue;
      setFollow(db, account, name, "followed");
      added += 1;
    }
  })();
  return added;
}

export class FollowSync {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: Database,
    private readonly lyterion: Lyterion,
    private readonly accounts: () => string[],
    private readonly fetcher: typeof fetch = fetch,
  ) {
    createReleaseTables(db);
  }

  start(): void {
    const first = setTimeout(() => void this.runDue(), 60_000);
    first.unref();
    this.timer = setInterval(() => void this.runDue(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async runDue(now = Date.now()): Promise<void> {
    const last = Number(this.db.query<{ value: string }, []>(`select value from meta where key = '${LAST_RUN}'`).get()?.value ?? 0);
    if (now - last < DAY) return;
    const accounts = this.accounts();
    if (!accounts.length) return;
    const artists = await fetchFollowedArtists(this.lyterion, this.fetcher);
    if (!artists) return;
    for (const account of accounts) applySpotifyFollows(this.db, account, artists);
    this.db.query("insert or replace into meta (key, value) values (?, ?)").run(LAST_RUN, String(now));
  }

  async sync(account: string): Promise<SyncResult | null> {
    const artists = await fetchFollowedArtists(this.lyterion, this.fetcher);
    if (!artists) return null;
    return { added: applySpotifyFollows(this.db, account, artists), total: artists.length };
  }
}
