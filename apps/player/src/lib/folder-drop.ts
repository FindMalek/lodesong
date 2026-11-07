import type { DragEvent } from "react";
import { currentMove, endDrag, leftTarget } from "./drag";
import { notify } from "./notify";

/** A folder (or the top level, null) takes a dragged playlist in; the playlist's own songs are not touched. */
export function folderDrop(folderId: string | null, setActive: (id: string | null) => void) {
  return {
    onDragOver: (event: DragEvent) => {
      if (!currentMove(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setActive(folderId ?? "root");
    },
    onDragLeave: (event: DragEvent) => leftTarget(event) && setActive(null),
    onDrop: (event: DragEvent) => {
      const playlist = currentMove(event);
      setActive(null);
      if (!playlist) return;
      event.preventDefault();
      event.stopPropagation();
      endDrag();
      void import("./folder-edits").then((edits) => edits.placePlaylist(playlist.id, folderId));
    },
  };
}

/** A "Chill / Night" group is only a naming habit: it can't take a playlist until it is a real folder. */
export const legacyDrop = {
  onDragOver: (event: DragEvent) => {
    if (currentMove(event)) event.preventDefault();
  },
  onDrop: (event: DragEvent) => {
    if (!currentMove(event)) return;
    event.preventDefault();
    endDrag();
    notify({ message: "that group is only a name for now, open its ⋯ menu and make it a real folder first" });
  },
};
