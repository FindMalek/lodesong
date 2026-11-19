import { type ArtistGroup, type ArtistMerge, groupArtists } from "@lodesong/shared/artist-merges";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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

export function useArtistMerges(): ArtistMerge[] {
  const { data } = useQuery(rpc.artists.merges.queryOptions({ staleTime: 0 }));
  return data?.merges ?? [];
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
