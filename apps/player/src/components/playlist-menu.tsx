import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@lodesong/ui/components/dropdown-menu";
import { EyeIcon, EyeOffIcon, ImageIcon, ImageOffIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ItemMoreButton } from "@/components/item-menu";
import { usePlaylistCoverPicker } from "@/components/playlist-cover";
import { deletePlaylist, leafOf, updatePlaylist } from "@/lib/playlists";
import type { Playlist } from "@/lib/types";

/** The playlist header's "...": the shared actions, then the rare and destructive ones, with delete last and behind a confirm. */
export function PlaylistMenu({ playlist, path, onRename }: { playlist: Playlist; path: string; onRename?: () => void }) {
  const cover = usePlaylistCoverPicker(playlist.id, Boolean(onRename));
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <ItemMoreButton
        target={{ kind: "playlist", playlist }}
        label={leafOf(playlist.name)}
        className="size-8"
        extra={
          onRename && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRename}>
                <PencilIcon /> rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void updatePlaylist(playlist.id, { public: !playlist.public })}>
                {playlist.public ? <EyeOffIcon /> : <EyeIcon />} {playlist.public ? "make private" : "make public"}
              </DropdownMenuItem>
              {cover.available && (
                <DropdownMenuItem onClick={cover.choose}>
                  <ImageIcon /> {cover.hasPicture ? "change picture" : "add picture"}
                </DropdownMenuItem>
              )}
              {cover.available && cover.hasPicture && (
                <DropdownMenuItem onClick={cover.remove}>
                  <ImageOffIcon /> remove cover
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2Icon /> delete playlist…
              </DropdownMenuItem>
            </>
          )
        }
      />
      {cover.input}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">delete {leafOf(playlist.name)}?</DialogTitle>
            <DialogDescription>You can undo for 10 seconds after.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                deletePlaylist(playlist, path);
              }}
            >
              delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
