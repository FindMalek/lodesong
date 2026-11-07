import { useSyncExternalStore } from "react";
import type { Song } from "./types";

/*
 * Which playlist dialog is open (new playlist, folder), so the sidebar, the shortcut and the selection bar can ask for
 * one without carrying the dialog code: the host in app.tsx loads it when asked.
 */

export type PlaylistDialog =
  | { kind: "new"; folder?: string; folderId?: string; songs?: Song[] }
  | { kind: "folder"; path: string }
  | { kind: "folder-new"; parentId: string | null }
  | { kind: "folder-edit"; id: string }
  | { kind: "folder-move"; playlistId: string }
  | null;

/** What makes two asks for a dialog different, so a new ask starts a fresh one. */
export function playlistDialogKey(dialog: NonNullable<PlaylistDialog>): string {
  if (dialog.kind === "new") return `new:${dialog.folder ?? ""}:${dialog.folderId ?? ""}`;
  if (dialog.kind === "folder") return `folder:${dialog.path}`;
  if (dialog.kind === "folder-new") return `folder-new:${dialog.parentId ?? ""}`;
  if (dialog.kind === "folder-move") return `folder-move:${dialog.playlistId}`;
  return `folder-edit:${dialog.id}`;
}

let open: PlaylistDialog = null;
const listeners = new Set<() => void>();

export function openPlaylistDialog(dialog: PlaylistDialog): void {
  open = dialog;
  for (const listener of listeners) listener();
}

export function usePlaylistDialog(): PlaylistDialog {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
