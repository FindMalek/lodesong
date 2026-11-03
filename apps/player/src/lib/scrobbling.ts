import { statsQuery } from "@/components/stats-query";
import { api, getUser } from "./subsonic";

const DAY = 86_400_000;

/** Whether Navidrome scrobbles this account (to Last.fm / ListenBrainz): null when it doesn't say. */
export const scrobblingQuery = {
  queryKey: ["scrobbling"],
  queryFn: async (): Promise<boolean | null> =>
    (await api<{ user?: { scrobblingEnabled?: boolean } }>("getUser", { username: getUser() ?? "" })).user?.scrobblingEnabled ?? null,
  staleTime: 60 * 60_000,
};

/** Plays so far today: what the player has told Navidrome to scrobble (skips under 30 s are not counted). */
export function playsTodayQuery() {
  const start = new Date().setHours(0, 0, 0, 0);
  return statsQuery(start, start + DAY);
}
