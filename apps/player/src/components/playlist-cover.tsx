import { Cover } from "@/components/cover";
import { FolderCover } from "@/components/folder-cover";
import { usePlaylistCover } from "@/lib/playlist-covers";
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
