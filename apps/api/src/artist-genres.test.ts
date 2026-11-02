import { expect, test } from "bun:test";
import { ArtistGenres } from "./artist-genres";
import { openLibraryDb } from "./db";
import { MusicBrainz } from "./releases";
import { createIndexTables } from "./search-index";

const put = (db: ReturnType<typeof openLibraryDb>, kind: string, data: Record<string, unknown>) =>
  db
    .query("insert into idx_items (server, kind, id, folder, name, norm, data, generation) values ('s', ?, ?, '1', 'x', 'x', ?, 1)")
    .run(kind, String(data.id), JSON.stringify(data));

test("untagged albums get their artist's musicbrainz genres, cached, and tagged ones stay untouched", async () => {
  const db = openLibraryDb(":memory:");
  createIndexTables(db);
  put(db, "album", { id: "a1", artist: "Slowdive", songCount: 8 });
  put(db, "album", { id: "a2", artist: "Slowdive", songCount: 4, genres: [] });
  put(db, "album", { id: "a3", artist: "Slowdive", songCount: 9, genre: "Rock" });
  put(db, "song", { id: "s1" });
  put(db, "song", { id: "s2", genre: "Rock" });
  let lookups = 0;
  const fetcher = (async (url: string) => {
    lookups += 1;
    return Response.json(
      url.includes("/artist/")
        ? {
            genres: [
              { name: "dream pop", count: 2 },
              { name: "shoegaze", count: 9 },
            ],
          }
        : { artists: [{ id: "mb1", name: "Slowdive", score: 100 }] },
    );
  }) as unknown as typeof fetch;
  const genres = new ArtistGenres(db, new MusicBrainz("http://mb", fetcher, 0));

  const first = genres.report("s", null, "shoegaze");
  expect(first).toMatchObject({ untagged: { albums: 2, songs: 1 }, pending: 1, genres: [] });
  await genres.drain();

  const second = genres.report("s", null, "shoegaze");
  expect(second.pending).toBe(0);
  expect(second.genres).toEqual([
    { name: "dream pop", albums: 2, songs: 12 },
    { name: "shoegaze", albums: 2, songs: 12 },
  ]);
  expect(second.albums.map((album) => album.id).sort()).toEqual(["a1", "a2"]);
  expect(lookups).toBe(2);
});
