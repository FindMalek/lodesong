import type { AlbumTrack } from "@lodesong/shared/releases";
import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { type ComponentProps, useMemo, useSyncExternalStore } from "react";
import { placeMissing } from "@/lib/album-missing";
import { apiQueries } from "@/lib/api-queries";
import { ADD_CAP, fetchRest, type RestItem, restRun, subscribeRest } from "@/lib/fetch-rest";
import { HEADERS } from "@/lib/subsonic";
import { TrackList } from "./library";

const VARIOUS = /^various artists$/i;

async function fetchTracks(mbid: string): Promise<AlbumTrack[]> {
  const response = await fetch(`/api/album-tracks/${encodeURIComponent(mbid)}`, { headers: HEADERS });
  if (!response.ok) throw new Error("no track list");
  return ((await response.json()) as { tracks: AlbumTrack[] }).tracks;
}

type Props = Omit<ComponentProps<typeof TrackList>, "missing"> & { mbid?: string; artist: string };

/** An album's tracklist with the release's other tracks muted in place, and one quiet line to fetch them. */
export function AlbumTracklist({ mbid, artist, ...list }: Props) {
  const canAdd = useQuery(apiQueries.session()).data?.lyterionAdd === true;
  const { data } = useQuery({
    queryKey: ["album-tracks", mbid],
    queryFn: () => fetchTracks(mbid ?? ""),
    enabled: !!mbid,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const missing = useMemo(() => (data ? placeMissing(list.songs, data) : []), [data, list.songs]);
  const items = useMemo<RestItem[]>(() => {
    const seen = new Map<string, number>();
    return missing.map((track) => {
      const count = (seen.get(track.title) ?? 0) + 1;
      seen.set(track.title, count);
      const by = VARIOUS.test(artist) ? (track.artist ?? "") : artist;
      return { key: `${track.title}#${count}`, query: `${by} ${track.title}`.trim() };
    });
  }, [missing, artist]);
  const run = useSyncExternalStore(subscribeRest, () => restRun(mbid ?? ""));
  if (!data || missing.length === 0) return <TrackList {...list} />;
  const doneCount = items.filter((item) => run.added.has(item.key)).length;
  const progress = run.running ? `fetching ${Math.min(doneCount + 1, items.length)} of ${items.length}` : "";
  const label = run.finished ? "fetched" : doneCount > 0 && !run.running ? "carry on" : "fetch rest";
  const busy = run.running || run.finished;
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-muted-foreground text-xs">
        <span>
          own {data.length - missing.length} of {data.length} · {missing.length} not in your library
        </span>
        <span role="status" aria-live="polite">
          {progress}
        </span>
        {canAdd && (
          <Button
            size="xs"
            variant="secondary"
            className="ml-auto max-sm:h-11 max-sm:px-4"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) void fetchRest(mbid ?? "", items);
            }}
          >
            {label}
          </Button>
        )}
      </div>
      {canAdd && items.length - doneCount > ADD_CAP && !run.running && (
        <p className="mb-1 text-muted-foreground text-xs">
          lyterion takes {ADD_CAP} songs an hour, so the rest follows when you carry on later
        </p>
      )}
      {run.error && (
        <p role="alert" className="mb-1 text-destructive text-xs">
          {run.error}
        </p>
      )}
      <TrackList {...list} missing={missing} />
    </>
  );
}
