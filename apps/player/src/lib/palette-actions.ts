import { useQuery } from "@tanstack/react-query";
import { player, usePlayer } from "./player";
import { queries } from "./queries";
import { go, usePath } from "./router";
import type { Album, Playlist } from "./types";

export interface PaletteAction {
  id: string;
  label: string;
  group?: "queue";
  run: () => void;
}

/** The first actions for the page behind the palette: an album's play and queue, a playlist's own, the open queue's. */
export function usePageActions(open: boolean, queueOpen: boolean): PaletteAction[] {
  const [, section, id] = usePath().split("/");
  const param = id ? decodeURIComponent(id) : "";
  const album = useQuery({ ...queries.album(param), enabled: open && section === "album" && param !== "" }).data;
  const playlist = useQuery({ ...queries.playlist(param), enabled: open && section === "playlist" && param !== "" }).data;
  const shuffle = usePlayer((state) => state.queue.shuffle);
  const queueActions: PaletteAction[] = queueOpen
    ? [
        { id: "queue-shuffle", label: shuffle ? "turn shuffle off" : "turn shuffle on", group: "queue", run: () => player.toggleShuffle() },
        { id: "queue-clear", label: "clear up next", group: "queue", run: () => player.clearUpcoming() },
      ]
    : [];
  return [...pageActionsFor(section, album, playlist), ...queueActions];
}

function pageActionsFor(section: string | undefined, album: Album | undefined, playlist: Playlist | undefined): PaletteAction[] {
  if (section === "album" && album) {
    const songs = album.song ?? [];
    const actions: PaletteAction[] = [
      {
        id: "album-play",
        label: `play ${album.name}`,
        run: () => player.play(songs, 0, { album: true, source: { kind: "album", name: album.name } }),
      },
      { id: "album-queue", label: "add album to queue", run: () => player.addToQueue(songs) },
    ];
    if (album.artistId)
      actions.push({
        id: "album-artist",
        label: `go to ${album.artist ?? "artist"}`,
        run: () => go(`/artist/${encodeURIComponent(album.artistId ?? "")}`),
      });
    return actions;
  }
  if (section === "playlist" && playlist) {
    const songs = playlist.entry ?? [];
    return [
      {
        id: "playlist-play",
        label: `play ${playlist.name}`,
        run: () => player.play(songs, 0, { source: { kind: "playlist", name: playlist.name } }),
      },
      {
        id: "playlist-shuffle",
        label: "shuffle playlist",
        run: () => player.play(songs, 0, { shuffle: true, source: { kind: "playlist", name: playlist.name } }),
      },
      { id: "playlist-queue", label: "add playlist to queue", run: () => player.addToQueue(songs) },
    ];
  }
  return [];
}
