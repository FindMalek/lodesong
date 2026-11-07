import type { Vibe } from "@lodesong/shared/vibes";
import { apiQueries } from "./api-queries";
import { player } from "./player";
import { queries, queryClient } from "./queries";
import type { Song } from "./types";

const MIX_SIZE = 50;

/** Songs that fit by AudioMuse features, or, without them, songs of the matching genres. */
export async function playVibe(vibe: Vibe, genres: string[]): Promise<void> {
  const found = await queryClient.fetchQuery(apiQueries.search(vibe.query, MIX_SIZE)).catch(() => null);
  let songs = (found?.songs ?? []) as unknown as Song[];
  if (!songs.length) {
    const lists = await Promise.all(genres.slice(0, 3).map((genre) => queryClient.fetchQuery(queries.songsByGenre(genre, 20))));
    songs = lists.flat().sort(() => Math.random() - 0.5);
  }
  if (songs.length) player.play(songs, 0, { source: { kind: "search", name: `mix for ${vibe.label}` } });
}
