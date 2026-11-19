import { z } from "zod";
import { normalize } from "./normalize";

export const MAX_ARTIST_MERGES = 500;

export const artistMergeSchema = z.object({
  key: z.string().trim().min(1).max(200).describe("`normalize(name)` of the merged artists"),
  unmerged: z.boolean().describe("Kept as separate artists"),
  name: z.string().trim().min(1).max(200).nullable().describe("The spelling to show, instead of the most common one"),
});

export type ArtistMerge = z.infer<typeof artistMergeSchema>;

interface ArtistRef {
  id: string;
  name: string;
  albumCount?: number;
}

/** Artists whose names `normalize` the same (`SHYLER`, `Shyler`), as one. `id` is the first one's; the page opens any of `ids`. */
export interface ArtistGroup<T extends ArtistRef = ArtistRef> {
  key: string;
  id: string;
  ids: string[];
  name: string;
  names: string[];
  albumCount: number;
  artists: T[];
  unmerged: boolean;
}

const isMixed = (name: string) => name !== name.toUpperCase() && name !== name.toLowerCase();

/** The most common spelling; on a tie, mixed case before all caps or all lowercase; an all caps winner gives way to a mixed case one. */
export function shownName(artists: Pick<ArtistRef, "name">[], chosen?: string | null): string {
  const counts = new Map<string, number>();
  for (const { name } of artists) counts.set(name, (counts.get(name) ?? 0) + 1);
  if (chosen && counts.has(chosen)) return chosen;
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || Number(isMixed(b[0])) - Number(isMixed(a[0])));
  const winner = ranked[0]?.[0] ?? "";
  if (winner && winner === winner.toUpperCase()) return ranked.find(([name]) => isMixed(name))?.[0] ?? winner;
  return winner;
}

export function groupArtists<T extends ArtistRef>(artists: T[], merges: ArtistMerge[] = []): ArtistGroup<T>[] {
  const changed = new Map(merges.map((merge) => [merge.key, merge]));
  const groups = new Map<string, T[]>();
  for (const artist of artists) {
    const key = normalize(artist.name) || artist.name;
    const split = changed.get(key)?.unmerged;
    const slot = split ? `${key}\0${artist.id}` : key;
    groups.set(slot, [...(groups.get(slot) ?? []), artist]);
  }
  return [...groups.values()].map((members) => {
    const key = normalize(members[0]?.name ?? "") || (members[0]?.name ?? "");
    const merge = changed.get(key);
    const name = shownName(members, merge?.name);
    return {
      key,
      id: members[0]?.id ?? "",
      ids: members.map((member) => member.id),
      name,
      names: [name, ...new Set(members.map((member) => member.name).filter((spelling) => spelling !== name))],
      albumCount: members.reduce((sum, member) => sum + (member.albumCount ?? 0), 0),
      artists: members,
      unmerged: merge?.unmerged === true,
    };
  });
}
