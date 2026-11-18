import type { PlaylistCoverKind } from "@lodesong/shared/playlist-folders";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { notify } from "./notify";
import { coverView, type PlaylistCoverView } from "./playlist-cover-view";
import { queryClient } from "./queries";
import { rpc } from "./rpc";

const playlistCoversQuery = () =>
  queryOptions({
    queryKey: ["playlistCovers"],
    queryFn: () => rpc.playlists.covers.call(),
    staleTime: 60_000,
  });

export function usePlaylistCover(id: string): PlaylistCoverView {
  return coverView(useQuery(playlistCoversQuery()).data?.covers, id);
}

export async function setPlaylistCover(id: string, kind: PlaylistCoverKind, image?: string): Promise<void> {
  try {
    await rpc.playlists.setCover.call({ id, kind, image });
  } catch {
    notify({ kind: "error", message: "couldn't save that cover" });
  } finally {
    await queryClient.invalidateQueries({ queryKey: playlistCoversQuery().queryKey });
  }
}
