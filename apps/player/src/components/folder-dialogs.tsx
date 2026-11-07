import { MAX_FOLDER_DEPTH, MAX_NAME_LENGTH } from "@lodesong/shared/playlist-folders";
import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Input } from "@lodesong/ui/components/input";
import { Label } from "@lodesong/ui/components/label";
import { useRef, useState } from "react";
import { coverFromFile } from "@/lib/folder-cover-file";
import { changeFolder, createFolder, deleteFolder } from "@/lib/folder-edits";
import { findFolder, movableInto, pathTo } from "@/lib/folder-tree";
import { notify } from "@/lib/notify";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { usePlaylistTree } from "@/lib/playlist-folders";
import { go } from "@/lib/router";
import { FolderCover } from "./folder-cover";

export function NewFolderDialog({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">new folder</DialogTitle>
          <DialogDescription>folders are kept in lodesong; your playlists keep their names in navidrome.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || saving) return;
            setSaving(true);
            void createFolder(name, parentId).then((folder) => {
              if (!folder) return setSaving(false);
              onClose();
              go(`/playlist-folder/${folder.id}`);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-folder-name">name</Label>
            <Input
              id="new-folder-name"
              autoFocus
              value={name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || saving}>
              create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditFolderDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const tree = usePlaylistTree();
  const folder = findFolder(tree, id);
  const [initial] = useState(() => ({ name: folder?.name ?? "", parentId: pathTo(tree, id).at(-2)?.id ?? "" }));
  const [name, setName] = useState(initial.name);
  const [parentId, setParentId] = useState(initial.parentId);
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!folder) return null;
  const shown = cover === undefined ? folder.cover : cover;
  const change = {
    ...(name.trim() === initial.name ? {} : { name }),
    ...(parentId === initial.parentId ? {} : { parentId: parentId || null }),
    ...(cover === undefined ? {} : { cover }),
  };
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">folder · {folder.name}</DialogTitle>
          <DialogDescription>
            nests up to {MAX_FOLDER_DEPTH} deep. deleting it keeps the playlists, they move up one level.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || saving) return;
            if (Object.keys(change).length === 0) return onClose();
            setSaving(true);
            void changeFolder(id, change).then((saved) => (saved ? onClose() : setSaving(false)));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-name">name</Label>
            <Input id="folder-name" autoFocus value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="folder-parent">inside</Label>
            <select
              id="folder-parent"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              className="h-8 border bg-transparent px-2 font-mono text-xs"
            >
              <option value="">top level</option>
              {movableInto(tree, id, MAX_FOLDER_DEPTH).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <FolderCover id={id} cover={shown} className="size-16 shrink-0 object-cover" />
            <div className="flex flex-col items-start gap-1.5">
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="folder picture"
                className="sr-only"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (picked)
                    void coverFromFile(picked).then((data) =>
                      data ? setCover(data) : notify({ kind: "error", message: "couldn't use that picture, try a png, jpeg or webp" }),
                    );
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
                upload a picture
              </Button>
              {shown && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCover(null)}>
                  use the aura
                </Button>
              )}
            </div>
          </div>
          {confirming ? (
            <DialogFooter className="gap-2">
              <p className="mr-auto self-center text-small">delete {folder.name}? its playlists move up one level.</p>
              <Button type="button" variant="outline" autoFocus onClick={() => setConfirming(false)}>
                keep it
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  const parent = pathTo(tree, id).at(-2)?.id;
                  setSaving(true);
                  void deleteFolder(id).then((deleted) => {
                    if (!deleted) return setSaving(false);
                    onClose();
                    if (location.pathname === `/playlist-folder/${id}`) go(parent ? `/playlist-folder/${parent}` : "/");
                  });
                }}
              >
                delete folder
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                delete
              </Button>
              <Button type="button" variant="outline" onClick={() => openPlaylistDialog({ kind: "new", folderId: id })}>
                new playlist in here
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                save
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
