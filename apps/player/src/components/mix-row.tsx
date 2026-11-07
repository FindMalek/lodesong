import { Alert, AlertAction, AlertTitle } from "@lodesong/ui/components/alert";
import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon } from "lucide-react";
import { useEffect } from "react";
import { Aura } from "@/components/aura";
import { Dither } from "@/components/dither";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { player } from "@/lib/player";
import { queries, queryClient } from "@/lib/queries";
import { rpc } from "@/lib/rpc";
import { api, getUser } from "@/lib/subsonic";
import type { Playlist, Song } from "@/lib/types";

interface Mix {
  id: string;
  name: string;
  description: string;
  songs: Song[];
}

const SAVED_KEY = "keep-player:mixes-saved";

function now() {
  const date = new Date();
  const tz = date.getTimezoneOffset();
  const hour = date.getHours();
  const slot = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 22 ? "evening" : "night";
  return { day: Math.floor((date.getTime() - tz * 60_000) / 86_400_000), hour, tz, slot };
}

// Mixes are real Navidrome playlists, replaced in place when they turn over, so every client has them too.
// Doing it twice just writes the same songs.
async function saveAsPlaylists(stamp: string, mixes: Mix[]): Promise<Playlist[]> {
  try {
    if (localStorage.getItem(SAVED_KEY) === stamp) return [];
    localStorage.setItem(SAVED_KEY, stamp);
  } catch {
    return [];
  }
  const playlists = await api<{ playlists?: { playlist?: Playlist[] } }>("getPlaylists").catch(() => null);
  const mine = (playlists?.playlists?.playlist ?? []).filter((playlist) => playlist.owner === getUser());
  const created: Playlist[] = [];
  for (const mix of mixes) {
    const existing = mine.find((playlist) => playlist.name === mix.name);
    const songId = mix.songs.map((song) => song.id);
    const reply = await api<{ playlist?: { id: string } }>(
      "createPlaylist",
      existing ? { playlistId: existing.id, songId } : { name: mix.name, songId },
    ).catch(() => null);
    const id = existing?.id ?? reply?.playlist?.id;
    if (!existing && id)
      created.push({
        id,
        name: mix.name,
        owner: getUser() ?? undefined,
        comment: mix.description,
        songCount: mix.songs.length,
        duration: mix.songs.reduce((total, song) => total + (song.duration ?? 0), 0),
      });
    if (id) await api("updatePlaylist", { playlistId: id, comment: mix.description }).catch(() => undefined);
  }
  return created;
}

export function MixRow() {
  const { day, hour, tz, slot } = now();
  const mixes = useQuery(
    rpc.mixes.queryOptions({
      input: { day, hour, tz },
      staleTime: (query) => (query.state.data?.mixes.length ? 60 * 60_000 : 0),
      refetchOnWindowFocus: false,
      select: (result) => result.mixes as Mix[],
    }),
  );
  const { data } = mixes;
  const playlists = useQuery({ ...queries.playlists(), refetchOnMount: false }).data;
  useEffect(() => {
    // New playlists go straight into the cached list: a refetch could undo a delete still waiting out its undo.
    if (!data?.length) return;
    void saveAsPlaylists(`${day}:${slot}`, data).then((created) => {
      if (created.length)
        queryClient.setQueryData(queries.playlists().queryKey, (current?: Playlist[]) => (current ? [...current, ...created] : current));
    });
  }, [data, day, slot]);
  if (mixes.isPending) return null;
  if (mixes.isError && !data)
    return (
      <Section title="made for you">
        <Alert variant="destructive">
          <AlertTitle className="font-mono">couldn't load made for you</AlertTitle>
          <AlertAction>
            <Button size="xs" variant="outline" onClick={() => void mixes.refetch()}>
              retry
            </Button>
          </AlertAction>
        </Alert>
      </Section>
    );
  if (!data?.length) return null;
  return (
    <Section title="made for you">
      <ul aria-label="made for you" className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {data.map((mix) => {
          const playlist = playlists?.find((item) => item.name === mix.name && item.owner === getUser());
          const href = playlist ? `/playlist/${playlist.id}` : undefined;
          const cover = (
            <span className="relative block aspect-square w-full overflow-hidden border">
              <Aura id={`${mix.id}-${day}`} songs={mix.songs} className="size-full" />
              <Dither id={`${mix.id}-${day}`} className="absolute inset-0 size-full" />
              <span className="absolute inset-0 flex items-end p-2 font-medium font-mono text-sm">
                <span className="bg-background/70 px-1">{mix.name}</span>
              </span>
            </span>
          );
          return (
            <li key={mix.id} className="group/mix relative flex flex-col gap-1">
              {href ? (
                <Link href={href} aria-label={mix.name}>
                  {cover}
                </Link>
              ) : (
                cover
              )}
              <Button
                size="icon-sm"
                aria-label={`play ${mix.name}`}
                className="absolute top-2 right-2 opacity-0 focus-visible:opacity-100 group-hover/mix:opacity-100"
                onClick={() => player.play(mix.songs, 0, { source: { kind: "playlist", name: mix.name, href } })}
              >
                <PlayIcon className="fill-current" />
              </Button>
              <span className="line-clamp-2 text-muted-foreground text-xs">{mix.description}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
