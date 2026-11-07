import type { PlaylistFolders } from "@lodesong/shared/playlist-folders";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { buildTree, type FolderNode } from "./folder-tree";
import { queries } from "./queries";
import { HEADERS } from "./subsonic";

// Folders are lodesong's own (per account, synced); the playlists in them stay in Navidrome under their own names.

let writes: Promise<unknown> = Promise.resolve();

export function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = writes.then(task);
  writes = run.catch(() => undefined);
  return run;
}

export const foldersQuery = () =>
  queryOptions({
    queryKey: ["playlistFolders"],
    queryFn: async (): Promise<PlaylistFolders> => {
      await writes;
      const response = await fetch("/api/folders", { headers: HEADERS });
      if (!response.ok) throw new Error(`folders: ${response.status}`);
      return (await response.json()) as PlaylistFolders;
    },
    staleTime: 60_000,
    refetchOnMount: "always",
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

function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeOpen(open: Set<string>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {}
}

export function forgetOpen(id: string): void {
  const open = readOpen();
  if (open.delete(id)) writeOpen(open);
}

/** Which sidebar folders are open (kept on this device). Real folders that no longer exist are dropped from it. */
export function useOpenFolders(): [Set<string>, (key: string, next: boolean) => void] {
  const [open, setOpen] = useState(readOpen);
  const [mountedAt] = useState(Date.now);
  const { data, dataUpdatedAt } = useQuery(foldersQuery());
  const folders = dataUpdatedAt >= mountedAt ? data?.folders : undefined;
  useEffect(() => {
    if (!folders) return;
    const real = new Set(folders.map((folder) => folder.id));
    const kept = [...open].filter((key) => key.startsWith("/") || real.has(key));
    if (kept.length === open.size) return;
    setOpen(new Set(kept));
    writeOpen(new Set(kept));
  }, [folders, open]);
  const toggle = (key: string, next: boolean) => {
    const updated = new Set(open);
    if (next) updated.add(key);
    else updated.delete(key);
    setOpen(updated);
    writeOpen(updated);
  };
  return [open, toggle];
}

export function useFoldersSettled(): boolean {
  const { data, fetchStatus } = useQuery(foldersQuery());
  return data !== undefined || fetchStatus !== "fetching";
}
