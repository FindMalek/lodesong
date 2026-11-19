import { groupArtists } from "@lodesong/shared/artist-merges";
import { normalize } from "@lodesong/shared/normalize";
import type { Follow } from "@lodesong/shared/releases";
import { Badge } from "@lodesong/ui/components/badge";
import { Button } from "@lodesong/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@lodesong/ui/components/input-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PinIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Cover } from "@/components/cover";
import { EmptyState, PageHeader, Section } from "@/components/library";
import { Link } from "@/components/link";
import { ArtistRowsSkeleton } from "@/components/skeletons";
import SyncFollows from "@/components/sync-follows";
import { apiQueries } from "@/lib/api-queries";
import { useArtistMerges } from "@/lib/artist-merge";
import { queries } from "@/lib/queries";
import { rpc } from "@/lib/rpc";
import type { Artist } from "@/lib/types";
import { done } from "@/lib/undo";

type Sort = "pinned" | "a-z" | "newest";

const SORTS: [Sort, string][] = [
  ["pinned", "pinned first"],
  ["a-z", "a-z"],
  ["newest", "newest release"],
];

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-label={label} className="m-0 flex min-w-0 gap-1 border-0 p-0">
      {options.map(([option, text]) => (
        <Button
          key={option}
          size="xs"
          variant={value === option ? "secondary" : "ghost"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {text}
        </Button>
      ))}
    </fieldset>
  );
}

const STATUS_HELP: Record<Follow["status"], string> = {
  pinned: "pinned: you pinned this artist, so they sort first",
  auto: "auto-followed: you played them 3 times in the last 90 days",
  followed: "followed",
};

function ArtistName({ name, match }: { name: string; match?: { id: string; name: string } }) {
  if (!match) {
    return (
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm" title="not in your library yet">
        <span className="truncate text-muted-foreground">{name}</span>
        <span className="shrink-0 font-mono text-muted-foreground text-xs">not in library</span>
      </span>
    );
  }
  return (
    <Link href={`/artist/${match.id}`} className="min-w-0 flex-1 truncate text-sm underline-offset-3 hover:underline">
      {match.name}
    </Link>
  );
}

function useFollowing() {
  const client = useQueryClient();
  const follows = useQuery(rpc.follows.list.queryOptions({ staleTime: 0 }));
  const refreshFeed = () => void client.invalidateQueries({ queryKey: rpc.releases.list.queryOptions().queryKey });
  const set = useMutation(
    rpc.follows.set.mutationOptions({
      onSuccess: (data) => {
        client.setQueryData(rpc.follows.list.queryOptions().queryKey, data);
        refreshFeed();
        // A new follow is looked up in the background.
        setTimeout(refreshFeed, 5000);
      },
    }),
  );
  return { follows, set };
}

function FindArtists({ followed, follow }: { followed: Set<string>; follow: (name: string) => void }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 120);
    return () => clearTimeout(id);
  }, [text]);
  const found = useQuery({ ...apiQueries.search(query, 6), enabled: query.length > 0, placeholderData: (previous) => previous });
  const artists = query ? ((found.data?.artists ?? []) as unknown as Artist[]) : [];
  const exact = artists.some((artist) => normalize(artist.name) === normalize(query));
  return (
    <Section title="find an artist">
      <InputGroup className="h-8 max-w-xl">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="find an artist to follow"
          placeholder="an artist, typos are fine"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="font-mono"
        />
      </InputGroup>
      {query && (
        <ul aria-label="artist results" className="mt-2 flex max-w-xl flex-col">
          {artists.map((artist) => (
            <li key={artist.id} className="flex items-center gap-3 border-b py-1.5">
              <Cover id={artist.coverArt} size={32} className="size-8 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{artist.name}</span>
              {followed.has(normalize(artist.name)) ? (
                <span className="font-mono text-muted-foreground text-xs">following</span>
              ) : (
                <Button size="xs" variant="outline" aria-label={`follow ${artist.name}`} onClick={() => follow(artist.name)}>
                  <PlusIcon /> follow
                </Button>
              )}
            </li>
          ))}
          {!exact && !followed.has(normalize(query)) && (
            <li className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">not in your library? follow “{query}” by name</span>
              <Button size="xs" variant="outline" aria-label={`follow ${query}`} onClick={() => follow(query)}>
                <PlusIcon /> follow
              </Button>
            </li>
          )}
        </ul>
      )}
    </Section>
  );
}

function sorted(artists: Follow[], sort: Sort, latest: Map<string, string>): Follow[] {
  const byName = (a: Follow, b: Follow) => a.name.localeCompare(b.name);
  if (sort === "a-z") return [...artists].sort(byName);
  if (sort === "newest")
    return [...artists].sort(
      (a, b) => (latest.get(normalize(b.name)) ?? "").localeCompare(latest.get(normalize(a.name)) ?? "") || byName(a, b),
    );
  return artists;
}

/** `/following`: who you follow and finding more; their new music lands in the release radar mix. */
export function FollowingPage() {
  const { follows, set } = useFollowing();
  const feed = useQuery(rpc.releases.list.queryOptions({ staleTime: 0, refetchOnWindowFocus: false }));
  const [sort, setSort] = useState<Sort>("pinned");
  const library = useQuery(queries.artists());
  const merges = useArtistMerges();
  const libraryArtists = useMemo(() => {
    const groups = new Map<string, { id: string; name: string }>();
    for (const group of groupArtists(
      (library.data ?? []).flatMap((letter) => letter.artist),
      merges,
    ))
      if (!groups.has(group.key)) groups.set(group.key, { id: group.id, name: group.name });
    return groups;
  }, [library.data, merges]);
  const unfollow = (artist: Follow, row: HTMLElement | null) => {
    const next = row?.nextElementSibling ?? row?.previousElementSibling;
    const target = next?.querySelector<HTMLElement>("a, button") ?? row?.parentElement;
    target?.focus();
    const back = (status: "followed" | "pinned" | "unfollowed") => () => set.mutateAsync({ name: artist.name, status });
    set.mutate({ name: artist.name, status: "unfollowed" });
    done(
      { label: `unfollowed ${artist.name}`, undo: back(artist.status === "pinned" ? "pinned" : "followed"), redo: back("unfollowed") },
      8000,
    );
  };

  const artists = follows.data?.artists ?? [];
  const followed = useMemo(() => new Set(artists.map((artist) => normalize(artist.name))), [artists]);
  const latest = useMemo(() => {
    const dates = new Map<string, string>();
    for (const release of feed.data?.releases ?? []) {
      const key = normalize(release.artist);
      if ((dates.get(key) ?? "") < release.date) dates.set(key, release.date);
    }
    return dates;
  }, [feed.data]);

  return (
    <>
      <PageHeader title="following" meta={follows.data ? `${artists.length} artists` : undefined} />
      <FindArtists followed={followed} follow={(name) => set.mutate({ name, status: "followed" })} />
      <Section
        title="your artists"
        action={
          <div className="flex items-center gap-3">
            <SyncFollows />
            <Choice label="sort artists" value={sort} options={SORTS} onChange={setSort} />
          </div>
        }
      >
        {follows.isPending ? (
          <ArtistRowsSkeleton count={6} className="" min={260} row="h-9.25" />
        ) : artists.length ? (
          <ul aria-label="followed artists" tabIndex={-1} className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6">
            {sorted(artists, sort, latest).map((artist) => (
              <li key={artist.name} className="flex items-center gap-2 border-b py-1">
                <ArtistName name={artist.name} match={libraryArtists.get(normalize(artist.name))} />
                {artist.status !== "followed" && (
                  <Badge
                    variant="outline"
                    className="font-mono font-normal"
                    title={STATUS_HELP[artist.status]}
                    aria-label={STATUS_HELP[artist.status]}
                  >
                    {artist.status === "auto" ? "auto-followed" : artist.status}
                  </Badge>
                )}
                <Button
                  size="icon-sm"
                  variant={artist.status === "pinned" ? "secondary" : "ghost"}
                  className="pointer-coarse:size-11"
                  aria-label={`${artist.status === "pinned" ? "unpin" : "pin"} ${artist.name}`}
                  aria-pressed={artist.status === "pinned"}
                  onClick={() => set.mutate({ name: artist.name, status: artist.status === "pinned" ? "followed" : "pinned" })}
                >
                  <PinIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ml-3 pointer-coarse:size-11"
                  aria-label={`unfollow ${artist.name}`}
                  title="unfollow (you can undo it)"
                  onClick={(event) => unfollow(artist, event.currentTarget.closest("li"))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          follows.data && (
            <EmptyState>
              you're not following anyone yet. the artists you play most (three plays in 90 days) are followed for you, or search above to
              follow one.
            </EmptyState>
          )
        )}
      </Section>
    </>
  );
}
