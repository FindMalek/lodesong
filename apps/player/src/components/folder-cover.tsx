import { cn } from "@/lib/utils";
import { Aura } from "./aura";

const NO_SONGS: never[] = [];

/** An uploaded picture, or the folder's own aura (seeded by its id, so it is the same on every device). */
export function FolderCover({ id, cover, className }: { id: string; cover: string | null; className?: string }) {
  return (
    <div className={cn("overflow-hidden bg-card", className)}>
      {cover ? (
        <img src={cover} alt="" className="size-full object-cover" />
      ) : (
        <Aura id={`folder:${id}`} songs={NO_SONGS} className="size-full" />
      )}
    </div>
  );
}
