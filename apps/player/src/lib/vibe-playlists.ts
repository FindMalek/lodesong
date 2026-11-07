import type { FitReason } from "@lodesong/shared/vibe-fit";
import { fitsPlaylist, type Vibe } from "@lodesong/shared/vibes";
import type { Playlist } from "./types";

export interface VibePlaylist {
  playlist: Playlist;
  reasons: FitReason[];
}

interface MoodFit {
  mood: string;
  playlists: { id: string; reasons: FitReason[] }[];
}

const SHOWN = 4;

/** The server's ranking once it answered for this very mood, otherwise the names alone (also all there is without AudioMuse). */
export function vibePlaylists(vibe: Vibe, playlists: Playlist[], fit: MoodFit | undefined): VibePlaylist[] {
  if (fit?.mood !== vibe.label)
    return playlists
      .filter((playlist) => fitsPlaylist(vibe, playlist.name))
      .slice(0, SHOWN)
      .map((playlist) => ({ playlist, reasons: ["name"] }));
  const known = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  return fit.playlists
    .flatMap(({ id, reasons }) => {
      const playlist = known.get(id);
      return playlist ? [{ playlist, reasons }] : [];
    })
    .slice(0, SHOWN);
}
