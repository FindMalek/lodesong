import type { Database } from "bun:sqlite";
import type { InferredGenre, InferredGenres } from "@lodesong/shared/genres";
import type { LibraryAlbum } from "@lodesong/shared/library";
import { normalize } from "@lodesong/shared/normalize";
import { folderFilter } from "./lyrics-coverage";
import { type MusicBrainz, matchArtist } from "./releases";

const DAY = 86_400_000;
const FRESH_MS = 90 * DAY;

export type UntaggedAlbum = LibraryAlbum & { songCount?: number; genre?: string; genres?: { name?: string }[] };

export type GenreReport = Omit<InferredGenres, "watching"> & { albums: UntaggedAlbum[] };

function createArtistGenreTables(db: Database): void {
  db.run(`create table if not exists artist_genres (
    key text primary key,
    name text not null,
    genres text not null,
    checked integer not null
  )`);
}

const isUntagged = (album: UntaggedAlbum): boolean => !album.genre?.trim() && !album.genres?.some((genre) => genre.name?.trim());

/** `known`: cached genres by normalized artist name; artists of untagged albums missing from it come back as `missing`. */
export function reportGenres(
  db: Database,
  server: string,
  folders: string[] | null,
  known: Map<string, string[]>,
  genre?: string,
): GenreReport & { missing: Map<string, string> } {
  const filter = folderFilter(folders);
  const albums = db
    .query<{ data: string }, string[]>(`select i.data from idx_items i where i.server = ? and i.kind = 'album'${filter.sql}`)
    .all(server, ...filter.params)
    .map((row) => JSON.parse(row.data) as UntaggedAlbum)
    .filter(isUntagged);
  const songs =
    db
      .query<{ n: number }, string[]>(
        `select count(*) as n from idx_items i where i.server = ? and i.kind = 'song'${filter.sql}
         and coalesce(json_extract(i.data, '$.genre'), '') = '' and coalesce(json_array_length(json_extract(i.data, '$.genres')), 0) = 0`,
      )
      .get(server, ...filter.params)?.n ?? 0;

  const missing = new Map<string, string>();
  const byGenre = new Map<string, InferredGenre>();
  const wanted = genre ? normalize(genre) : null;
  const listed: UntaggedAlbum[] = [];
  for (const album of albums) {
    const key = normalize(album.artist ?? "");
    if (!key) continue;
    const genres = known.get(key);
    if (!genres) {
      missing.set(key, album.artist ?? "");
      continue;
    }
    for (const name of genres) {
      const entry = byGenre.get(name) ?? { name, albums: 0, songs: 0 };
      entry.albums += 1;
      entry.songs += album.songCount ?? 0;
      byGenre.set(name, entry);
    }
    if (wanted && genres.some((name) => normalize(name) === wanted)) listed.push(album);
  }
  return {
    untagged: { albums: albums.length, songs },
    pending: missing.size,
    genres: [...byGenre.values()].sort((a, b) => b.songs - a.songs || a.name.localeCompare(b.name)),
    albums: listed,
    missing,
  };
}

export class ArtistGenres {
  private readonly queue = new Map<string, string>();
  private job: Promise<void> | null = null;

  constructor(
    private readonly db: Database,
    private readonly mb: MusicBrainz,
  ) {
    createArtistGenreTables(db);
  }

  private cached(now: number): Map<string, string[]> {
    return new Map(
      this.db
        .query<{ key: string; genres: string }, [number]>("select key, genres from artist_genres where checked >= ?")
        .all(now - FRESH_MS)
        .map((row) => [row.key, JSON.parse(row.genres) as string[]]),
    );
  }

  report(server: string, folders: string[] | null, genre?: string, now = Date.now()): InferredGenres & { albums: UntaggedAlbum[] } {
    const { missing, ...report } = reportGenres(this.db, server, folders, this.cached(now), genre);
    for (const [key, name] of missing) this.queue.set(key, name);
    void this.drain().catch(() => undefined);
    return { watching: true, ...report };
  }

  drain(now = Date.now()): Promise<void> {
    this.job ??= this.work(now).finally(() => {
      this.job = null;
    });
    return this.job;
  }

  private async work(now: number): Promise<void> {
    for (const [key, name] of this.queue) {
      await this.lookup(key, name, now);
      this.queue.delete(key);
    }
  }

  private async lookup(key: string, name: string, now: number): Promise<void> {
    const candidates = await this.mb.searchArtist(name);
    if (!candidates) return;
    const match = matchArtist(name, candidates);
    const genres = match ? await this.mb.artistGenres(match.id) : [];
    if (!genres) return;
    this.db
      .query(
        "insert into artist_genres (key, name, genres, checked) values (?, ?, ?, ?) on conflict (key) do update set genres = excluded.genres, checked = excluded.checked",
      )
      .run(key, name, JSON.stringify(genres), now);
  }
}
