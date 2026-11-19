import { useRef } from "react";
import { Cover } from "@/components/cover";
import { FolderCover } from "@/components/folder-cover";
import { coverFromFile } from "@/lib/folder-cover-file";
import { notify } from "@/lib/notify";
import { setPlaylistCover, usePlaylistCover } from "@/lib/playlist-covers";
import { isDemo } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

/** Navidrome's four-album mosaic unless this playlist was given the dither or a picture. */
export function PlaylistCover({
  id,
  coverArt,
  size,
  className,
  priority,
}: {
  id: string;
  coverArt?: string;
  size: number;
  className?: string;
  priority?: boolean;
}) {
  const view = usePlaylistCover(id);
  if (view.kind === "loading") return <div className={cn("aspect-square bg-card", className)} />;
  if (view.kind === "mosaic") return <Cover id={coverArt} size={size} className={className} priority={priority} />;
  return <FolderCover id={`playlist:${id}`} cover={view.kind === "image" ? view.url : null} className={cn("aspect-square", className)} />;
}

/** The picture actions of a playlist's cover, for its overflow menu: `input` stays mounted outside the menu so the file dialog survives it closing. */
export function usePlaylistCoverPicker(id: string, editable: boolean) {
  const view = usePlaylistCover(id);
  const file = useRef<HTMLInputElement>(null);
  const available = !isDemo() && editable && view.kind !== "loading";
  const input = available ? (
    <input
      ref={file}
      type="file"
      tabIndex={-1}
      accept="image/png,image/jpeg,image/webp"
      aria-label="playlist picture"
      className="sr-only"
      onChange={(event) => {
        const picked = event.target.files?.[0];
        event.target.value = "";
        if (picked)
          void coverFromFile(picked).then((data) =>
            data
              ? setPlaylistCover(id, "image", data)
              : notify({ kind: "error", message: "couldn't use that picture, try a png, jpeg or webp" }),
          );
      }}
    />
  ) : null;
  return {
    input,
    hasPicture: view.kind !== "loading" && view.kind !== "mosaic",
    available,
    choose: () => file.current?.click(),
    remove: () => void setPlaylistCover(id, "mosaic"),
  };
}
