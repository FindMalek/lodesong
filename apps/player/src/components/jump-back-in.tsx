import { Skeleton } from "@lodesong/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Cover } from "@/components/cover";
import { Equalizer } from "@/components/equalizer";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { usePlayer } from "@/lib/player";
import { queries } from "@/lib/queries";
import { KEEP, type RecentSource, useRecentSources } from "@/lib/recent-sources";
import { cn } from "@/lib/utils";

/** Spotify's "jump back in": the albums, playlists and artists you last played from, two lines of compact tiles. */
export function JumpBackIn() {
  const local = useRecentSources();
  // This browser's list is lost with its storage and empty on a new device: the server's recent albums fill the gaps.
  const query = useQuery(queries.albumList("recent", KEEP));
  const albums = query.data;
  const recent = useMemo(() => {
    const seen = new Set(local.map((source) => source.href));
    const server = (albums ?? [])
      .map((album): RecentSource => ({ kind: "album", name: album.name, href: `/album/${album.id}`, coverArt: album.coverArt }))
      .filter((source) => !seen.has(source.href));
    return [...local, ...server].slice(0, KEEP);
  }, [local, albums]);
  // The one playing right now says so, like the sidebar does.
  const playingHref = usePlayer((state) => state.queue.context.source?.href);
  const playing = usePlayer((state) => state.playing);
  if (!recent.length && query.isPending)
    return (
      <Section title="jump back in">
        <ul aria-label="jump back in" aria-busy className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
          {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
            <li key={key}>
              <div className="relative h-12">
                <Skeleton />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    );
  if (!recent.length) return null;
  return (
    <Section title="jump back in">
      <ul aria-label="jump back in" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
        {recent.map((source) => (
          <li key={source.href}>
            <Link
              href={source.href}
              aria-current={source.href === playingHref || undefined}
              className={cn(
                "flex h-12 items-center gap-3 border bg-card pr-3 hover:bg-accent",
                source.href === playingHref && "border-foreground",
              )}
            >
              <Cover id={source.coverArt ?? ""} size={48} className="size-12 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{source.name}</span>
                <span className="font-mono text-label text-muted-foreground">{source.kind}</span>
              </span>
              {source.href === playingHref && <Equalizer playing={playing} />}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
