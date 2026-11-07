import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Label } from "@lodesong/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { placePlaylist } from "@/lib/folder-edits";
import { folderOptions, placedIn } from "@/lib/folder-tree";
import { usePlaylistTree } from "@/lib/playlist-folders";
import { leafOf } from "@/lib/playlists";
import { queries } from "@/lib/queries";

/** The way to move a playlist without dragging (touch, keyboard, screen reader). Same move as the drop, same endpoint. */
export function MovePlaylistDialog({ playlistId, onClose }: { playlistId: string; onClose: () => void }) {
  const tree = usePlaylistTree();
  const playlist = useQuery(queries.playlists()).data?.find((item) => item.id === playlistId);
  const [folderId, setFolderId] = useState(() => placedIn(tree, playlistId));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">move to folder</DialogTitle>
          <DialogDescription>
            {playlist ? leafOf(playlist.name) : "playlist"} keeps its name, only where it sits in lodesong changes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void placePlaylist(playlistId, folderId || null);
            onClose();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-folder">folder</Label>
            <select
              id="move-folder"
              autoFocus
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
              className="h-8 border bg-transparent px-2 font-mono text-xs"
            >
              <option value="">top level</option>
              {folderOptions(tree).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit">move</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
