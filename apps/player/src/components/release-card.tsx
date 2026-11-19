import type { NewRelease } from "@lodesong/shared/releases";
import { Button } from "@lodesong/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@lodesong/ui/components/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, EllipsisIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { RELEASE_CARD_HEIGHT, when } from "@/lib/releases";
import { rpc } from "@/lib/rpc";

function tone(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function initials(title: string): string {
  return (
    title
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function useReleaseActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: rpc.releases.list.queryOptions().queryKey });
  return {
    get: useMutation(rpc.releases.get.mutationOptions({ onSuccess: refresh })),
    seen: useMutation(rpc.releases.seen.mutationOptions({ onSuccess: refresh })),
  };
}

export function ReleaseCard({ release }: { release: NewRelease }) {
  const { get, seen } = useReleaseActions();
  const [artFailed, setArtFailed] = useState(false);
  return (
    <li className="group/release relative flex w-40 shrink-0 flex-col" style={{ height: RELEASE_CARD_HEIGHT }}>
      <div
        aria-hidden
        className="relative flex size-40 shrink-0 items-center justify-center font-mono text-3xl text-foreground/40 outline outline-muted"
        style={{ background: `color-mix(in oklab, var(--card), var(--foreground) ${4 + (tone(release.id) % 5) * 3}%)` }}
      >
        {initials(release.title)}
        {!artFailed && (
          <img
            src={`/release-cover/${release.id}`}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
            onError={() => setArtFailed(true)}
          />
        )}
        {!release.seen && (
          <span className="absolute top-1.5 left-1.5 bg-foreground px-1 font-mono text-label text-background leading-4">new</span>
        )}
      </div>
      <a
        href={release.url}
        target="_blank"
        rel="noreferrer"
        title="open on musicbrainz"
        className="mt-2 truncate font-medium text-sm leading-5 outline-none after:absolute after:inset-0 focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-ring"
      >
        {release.title}
      </a>
      <span className="truncate text-muted-foreground text-xs leading-4">{release.artist}</span>
      <span className="truncate font-mono text-faint text-xs leading-4">
        {release.kind} · {when(release.date)}
      </span>
      <span className="relative z-10 mt-1 flex h-11 items-center">
        {release.canGet &&
          (release.requested ? (
            <span className="font-mono text-muted-foreground text-xs">asked lyterion</span>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              className="-ml-2 h-11 px-2 font-mono text-muted-foreground"
              disabled={get.isPending}
              aria-label={`get ${release.title}`}
              onClick={() => get.mutate({ id: release.id })}
            >
              get it
            </Button>
          ))}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              variant="secondary"
              aria-label={`more for ${release.title}`}
              className="absolute top-0 right-0 z-10 size-11 opacity-0 group-focus-within/release:opacity-100 group-hover/release:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100 sm:size-8"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max">
          {!release.seen && (
            <DropdownMenuItem className="min-h-11 sm:min-h-0" onClick={() => seen.mutate({ ids: [release.id] })}>
              <CheckIcon /> mark seen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="min-h-11 sm:min-h-0" render={<a href={release.url} target="_blank" rel="noreferrer" />}>
            <ExternalLinkIcon /> open on musicbrainz
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
