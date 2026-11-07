import type { FitReason } from "@lodesong/shared/vibe-fit";
import { fitsPlaylist, type Vibe } from "@lodesong/shared/vibes";
import type { t } from "./i18n";
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
const POLL_MS = 3000;
const MAX_POLLS = 5;

export function moodPollMs(state: { data?: { complete: boolean }; dataUpdateCount: number }): number | false {
  return state.data?.complete === false && state.dataUpdateCount < MAX_POLLS ? POLL_MS : false;
}

/** A playlist can fit by sound without any reason being strong enough to name. */
export function fitWords(reasons: FitReason[], say: typeof t): string {
  return reasons.length ? reasons.map((reason) => say(`fit.${reason}`)).join(", ") : say("fit.mood");
}

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
