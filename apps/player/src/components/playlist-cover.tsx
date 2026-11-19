import { Button } from "@lodesong/ui/components/button";
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

/** A 24px button with a 44px hit area on touch screens. */
const ACTION =
  "relative text-muted-foreground pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2.5";

/** Under a playlist's cover: put a picture on it, or drop the dither or picture to go back to the four-album mosaic. */
export function PlaylistCoverActions({ id, editable }: { id: string; editable: boolean }) {
  const view = usePlaylistCover(id);
  const file = useRef<HTMLInputElement>(null);
  if (isDemo() || !editable || view.kind === "loading") return <div className="mt-1.5 h-12" />;
  return (
    <div className="mt-1.5 flex min-h-12 flex-wrap content-start gap-x-2">
      <Button type="button" variant="ghost" size="xs" className={ACTION} onClick={() => file.current?.click()}>
        {view.kind === "mosaic" ? "add picture" : "change picture"}
      </Button>
      {view.kind !== "mosaic" && (
        <Button type="button" variant="ghost" size="xs" className={ACTION} onClick={() => void setPlaylistCover(id, "mosaic")}>
          remove cover
        </Button>
      )}
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
    </div>
  );
}
