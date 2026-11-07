import type { Vibe } from "@lodesong/shared/vibes";
import { apiQueries } from "./api-queries";
import { notify } from "./notify";
import { player } from "./player";
import { queries, queryClient } from "./queries";
import type { Song } from "./types";

const POOL_SIZE = 50;
const MIN_MIX = 20;
const GENRES = 3;

let latest = 0;

const songsOf = (query: string) =>
  queryClient
    .fetchQuery(apiQueries.search(query, POOL_SIZE))
    .then((found) => found.songs as unknown as Song[])
    .catch(() => [] as Song[]);

const genreSongs = (genre: string) => queryClient.fetchQuery(queries.songsByGenre(genre, 20)).catch(() => [] as Song[]);

/** Filters alone give the same most played 50, so each genre adds its own pool; too few analysed songs are topped up by genre. */
export async function playVibe(vibe: Vibe, genres: string[]): Promise<void> {
  const mine = ++latest;
  const context = player.getState().queue.context;
  const picked = genres.slice(0, GENRES);
  const pools = await Promise.all([vibe.query, ...picked.map((genre) => `${vibe.query} genre:"${genre.replace(/"/g, "")}"`)].map(songsOf));
  let songs = pools.flat();
  if (new Set(songs.map((song) => song.id)).size < MIN_MIX) songs = [...songs, ...(await Promise.all(picked.map(genreSongs))).flat()];
  if (mine !== latest || player.getState().queue.context !== context) return;
  const mix = [...new Map(songs.map((song) => [song.id, song])).values()];
  if (!mix.length) {
    notify({ message: `no songs to mix for ${vibe.label} yet`, kind: "error" });
    return;
  }
  player.play(mix, -1, { shuffle: true, source: { kind: "search", name: `mix for ${vibe.label}` } });
}
