import { type FolderImport, MAX_FOLDER_DEPTH, MAX_FOLDERS, MAX_NAME_LENGTH } from "@lodesong/shared/playlist-folders";
import type { FolderNode } from "./folder-tree";

type Entry = FolderImport["folders"][number];

/** A "Chill / Night" group as a list of folders for the server: whatever is nested past the limit joins the folder above it. */
export function legacyEntries(root: FolderNode): Entry[] {
  const entries: Entry[] = [];
  const visit = (node: FolderNode, parent: number | null, depth: number): void => {
    const roomy = depth <= MAX_FOLDER_DEPTH && entries.length < MAX_FOLDERS;
    const name = node.name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim() || "untitled";
    const at = parent === null || roomy ? entries.push({ parent, name, playlists: [] }) - 1 : parent;
    entries[at]?.playlists.push(...node.playlists.map((playlist) => playlist.id));
    for (const child of node.folders) visit(child, at, depth + 1);
  };
  visit(root, null, 1);
  return entries;
}
