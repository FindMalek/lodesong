import { useState } from "react";
import { cn } from "@/lib/utils";
import { Aura } from "./aura";

const NO_SONGS: never[] = [];

/** An uploaded picture, or the folder's own aura (seeded by its id, so it is the same on every device). */
export function FolderCover({ id, cover, className }: { id: string; cover: string | null; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <div className={cn("overflow-hidden bg-card", className)}>
      {cover && broken !== cover ? (
        <img src={cover} alt="" className="size-full object-cover" onError={() => setBroken(cover)} />
      ) : (
        <Aura id={`folder:${id}`} songs={NO_SONGS} className="size-full" />
      )}
    </div>
  );
}
