import { type FolderNode, SEPARATOR } from "./folder-tree";

export function findFolder(root: FolderNode, id: string): FolderNode | undefined {
  for (const folder of root.folders) {
    const found = folder.id === id ? folder : findFolder(folder, id);
    if (found) return found;
  }
  return undefined;
}

export function findLegacy(root: FolderNode, path: string): FolderNode | undefined {
  let at: FolderNode | undefined = root;
  for (const part of path.split(SEPARATOR)) at = at?.folders.find((folder) => folder.id === null && folder.name === part);
  return at === root ? undefined : at;
}

export function pathTo(root: FolderNode, id: string): FolderNode[] {
  for (const folder of root.folders) {
    if (folder.id === id) return [folder];
    const below = pathTo(folder, id);
    if (below.length) return [folder, ...below];
  }
  return [];
}

export function movableInto(root: FolderNode, id: string, limit: number): { id: string; label: string }[] {
  const height = (folder: FolderNode): number => 1 + Math.max(0, ...folder.folders.map(height));
  const moving = findFolder(root, id);
  const out: { id: string; label: string }[] = [];
  const walk = (folders: FolderNode[], names: string[]) => {
    for (const folder of folders) {
      if (folder.id === null || folder.id === id) continue;
      const label = [...names, folder.name];
      if (label.length + (moving ? height(moving) : 1) <= limit) out.push({ id: folder.id, label: label.join(SEPARATOR) });
      walk(folder.folders, label);
    }
  };
  walk(root.folders, []);
  return out;
}

export function folderOptions(root: FolderNode): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (folders: FolderNode[], names: string[]) => {
    for (const folder of folders) {
      const label = [...names, folder.name];
      if (folder.id !== null) out.push({ id: folder.id, label: label.join(SEPARATOR) });
      walk(folder.folders, label);
    }
  };
  walk(root.folders, []);
  return out;
}

export function placedIn(root: FolderNode, playlistId: string): string {
  for (const folder of root.folders) {
    if (folder.id !== null && folder.playlists.some((playlist) => playlist.id === playlistId)) return folder.id;
    const below = placedIn(folder, playlistId);
    if (below) return below;
  }
  return "";
}
