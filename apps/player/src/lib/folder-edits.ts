import type { PlaylistFolder, PlaylistFolders } from "@lodesong/shared/playlist-folders";
import { legacyEntries } from "./folder-import";
import type { FolderNode } from "./folder-tree";
import { notify } from "./notify";
import { foldersQuery, forgetOpen, inOrder } from "./playlist-folders";
import { queryClient } from "./queries";
import { rpc } from "./rpc";

const REASONS: Record<string, string> = {
  "too deep": "folders nest 4 levels at most",
  "too many": "that's more folders than lodesong keeps",
  "bad picture": "that picture can't be used, it needs to be a small png, jpeg or webp",
  missing: "that folder or playlist isn't there any more",
  invalid: "that name or place isn't allowed",
  "not in the public demo": "not in the public demo",
};

const reasonOf = (error: unknown): string => REASONS[(error as { message?: string } | null)?.message ?? ""] ?? "try again";
const failed = (what: string, error: unknown) => notify({ kind: "error", message: `couldn't ${what}: ${reasonOf(error)}` });
const refresh = () => queryClient.invalidateQueries({ queryKey: foldersQuery().queryKey });

export async function createFolder(name: string, parentId: string | null): Promise<PlaylistFolder | null> {
  try {
    return await rpc.folders.create.call({ name, parentId });
  } catch (error) {
    failed("make that folder", error);
    return null;
  } finally {
    await refresh();
  }
}

export async function changeFolder(
  id: string,
  change: { name?: string; parentId?: string | null; cover?: string | null },
): Promise<boolean> {
  try {
    await rpc.folders.update.call({ id, ...change });
    return true;
  } catch (error) {
    failed("save that folder", error);
    return false;
  } finally {
    await refresh();
  }
}

export async function deleteFolder(id: string): Promise<boolean> {
  try {
    await rpc.folders.remove.call({ id });
    forgetOpen(id);
    return true;
  } catch (error) {
    failed("delete that folder", error);
    return false;
  } finally {
    await refresh();
  }
}

let inFlight = 0;
let broke = false;

/** Shows the move at once and sends moves one after another, so the server ends up where the last drop left it. */
export function placePlaylist(playlistId: string, folderId: string | null): Promise<void> {
  const key = foldersQuery().queryKey;
  void queryClient.cancelQueries({ queryKey: key });
  queryClient.setQueryData(key, (current?: PlaylistFolders) => {
    if (!current) return current;
    const items = current.items.filter((item) => item.playlistId !== playlistId);
    return { ...current, items: folderId ? [...items, { playlistId, folderId }] : items };
  });
  inFlight += 1;
  const run = inOrder(() => rpc.folders.place.call({ id: playlistId, folderId })).then(
    () => undefined,
    (error) => {
      broke = true;
      failed("move that playlist", error);
    },
  );
  return run.then(async () => {
    inFlight -= 1;
    if (inFlight === 0 && broke) {
      broke = false;
      await refresh();
    }
  });
}

/** Turns an old "Chill / Night" folder, and the ones inside it, into real folders; the playlists keep their names. */
export async function convertFolder(node: FolderNode): Promise<boolean> {
  try {
    await rpc.folders.import.call({ parentId: null, folders: legacyEntries(node) });
    return true;
  } catch (error) {
    failed("make that a real folder", error);
    return false;
  } finally {
    await refresh();
  }
}
