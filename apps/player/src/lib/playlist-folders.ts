import type { PlaylistFolders } from "@lodesong/shared/playlist-folders";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildTree, type FolderNode } from "./folder-tree";
import { queries } from "./queries";
import { HEADERS } from "./subsonic";

// Folders are lodesong's own (per account, synced); the playlists in them stay in Navidrome under their own names.

export const foldersQuery = () =>
  queryOptions({
    queryKey: ["playlistFolders"],
    queryFn: async (): Promise<PlaylistFolders> => {
      const response = await fetch("/api/folders", { headers: HEADERS });
      if (!response.ok) throw new Error(`folders: ${response.status}`);
      return (await response.json()) as PlaylistFolders;
    },
    staleTime: 0,
  });

/** The sidebar and the folder page share one tree: real folders, then the old "Chill / Night" naming. */
export function usePlaylistTree(): FolderNode {
  const playlists = useQuery(queries.playlists()).data;
  const folders = useQuery(foldersQuery()).data;
  return useMemo(
    () =>
      buildTree(
        [...(playlists ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
        folders,
      ),
    [playlists, folders],
  );
}

const OPEN_KEY = "lodesong:folders-open";

export function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function writeOpen(open: Set<string>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {}
}
