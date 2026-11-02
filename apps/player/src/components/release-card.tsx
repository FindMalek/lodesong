import type { NewRelease } from "@lodesong/shared/releases";
import { Button } from "@lodesong/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
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
  return (
    <li className="flex w-40 shrink-0 flex-col" style={{ height: RELEASE_CARD_HEIGHT }}>
      <div
        aria-hidden
        className="relative flex size-40 shrink-0 items-center justify-center font-mono text-3xl text-foreground/40 outline outline-muted"
        style={{ background: `color-mix(in oklab, var(--card), var(--foreground) ${4 + (tone(release.id) % 5) * 3}%)` }}
      >
        {initials(release.title)}
        {!release.seen && (
          <span className="absolute top-1.5 left-1.5 bg-foreground px-1 font-mono text-label text-background leading-4">new</span>
        )}
      </div>
      <span className="mt-2 truncate font-medium text-sm leading-5">{release.title}</span>
      <span className="truncate text-muted-foreground text-xs leading-4">{release.artist}</span>
      <span className="truncate font-mono text-faint text-xs leading-4">
        {release.kind} · {when(release.date)}
      </span>
      <span className="mt-2 flex h-6 items-center gap-1">
        {release.canGet &&
          (release.requested ? (
            <span className="font-mono text-muted-foreground text-xs">asked lyterion</span>
          ) : (
            <Button
              size="xs"
              variant="outline"
              disabled={get.isPending}
              aria-label={`get ${release.title}`}
              onClick={() => get.mutate({ id: release.id })}
            >
              get it
            </Button>
          ))}
        <span className="ml-auto flex">
          {!release.seen && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`mark ${release.title} seen`}
              title="mark seen"
              onClick={() => seen.mutate({ ids: [release.id] })}
            >
              <CheckIcon />
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            title="open on musicbrainz"
            render={<a href={release.url} target="_blank" rel="noreferrer" aria-label={`${release.title} on musicbrainz`} />}
          >
            <ExternalLinkIcon />
          </Button>
        </span>
      </span>
    </li>
  );
}
