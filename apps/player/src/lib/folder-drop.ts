import type { DragEvent } from "react";
import { current, endDrag, leftTarget } from "./drag";

/** A folder (or the top level, null) takes a dragged playlist in; the playlist's own songs are not touched. */
export function folderDrop(folderId: string | null, setActive: (id: string | null) => void) {
  const dragged = (event: DragEvent) => {
    const drag = current(event);
    return drag?.target.kind === "playlist" ? drag.target.playlist : null;
  };
  return {
    onDragOver: (event: DragEvent) => {
      if (!dragged(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setActive(folderId ?? "root");
    },
    onDragLeave: (event: DragEvent) => leftTarget(event) && setActive(null),
    onDrop: (event: DragEvent) => {
      const playlist = dragged(event);
      setActive(null);
      if (!playlist) return;
      event.preventDefault();
      event.stopPropagation();
      endDrag();
      void import("./folder-edits").then((edits) => edits.placePlaylist(playlist.id, folderId));
    },
  };
}
