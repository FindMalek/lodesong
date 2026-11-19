import { type ArtistGroup, type ArtistMerge, groupArtists } from "@lodesong/shared/artist-merges";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queries } from "./queries";
import { rpc } from "./rpc";
import type { Artist } from "./types";

/** Search results: one entry per merged artist, in the order of its first hit. */
export function mergeArtistResults<T extends Artist>(items: T[], merges: ArtistMerge[]): T[] {
  return groupArtists(items, merges).map((group) => ({
    ...(group.artists[0] as T),
    id: group.id,
    name: group.name,
    albumCount: group.albumCount,
  }));
}

export function useArtistMergesQuery() {
  return useQuery(rpc.artists.merges.queryOptions({ staleTime: 5 * 60_000, refetchOnWindowFocus: false }));
}

export function useArtistMerges(): ArtistMerge[] {
  return useArtistMergesQuery().data?.merges ?? [];
}

export function useGroupedArtists(artists: Artist[]): ArtistGroup<Artist>[] {
  const merges = useArtistMerges();
  return useMemo(() => groupArtists(artists, merges), [artists, merges]);
}

export function useSetArtistMerge() {
  const client = useQueryClient();
  return useMutation(
    rpc.artists.setMerge.mutationOptions({
      onSuccess: () => client.invalidateQueries({ queryKey: rpc.artists.merges.queryOptions().queryKey }),
    }),
  );
}

/** Shown name by artist id, for artists that are merged or renamed; the rest keep the name on their albums. */
export function useArtistNames(): Map<string, string> {
  const { data } = useQuery(queries.artists());
  const merges = useArtistMerges();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const group of groupArtists(
      (data ?? []).flatMap((letter) => letter.artist),
      merges,
    ))
      if (group.names.length > 1 || group.ids.length > 1) for (const id of group.ids) names.set(id, group.name);
    return names;
  }, [data, merges]);
}
