import { normalize } from "@lodesong/shared/normalize";
import type { AlbumTrack } from "@lodesong/shared/releases";
import type { Song } from "./types";

const keyOf = (title: string): string => normalize(title) || title.trim().toLowerCase();

type Owned = Pick<Song, "title" | "track" | "discNumber">;

export interface MissingTrack extends AlbumTrack {
  position: number;
  /** The number to show: continues the owned song before it on the same disc, so it never clashes with how the album is numbered. */
  number: number;
  disc: number;
  /** Index of the owned song it is shown before, owned.length when it comes last. */
  before: number;
}

/** The release's tracks the library lacks, matched by title (a title owned once covers one repeat), each placed among the owned songs. */
export function placeMissing(owned: Owned[], tracks: AlbumTrack[]): MissingTrack[] {
  const have = new Map<string, number[]>();
  for (const [index, song] of owned.entries()) have.set(keyOf(song.title), [...(have.get(keyOf(song.title)) ?? []), index]);
  const found = tracks.map((track) => have.get(keyOf(track.title))?.shift());
  const out: MissingTrack[] = [];
  let lastNumber: number | undefined;
  let lastDisc: number | undefined;
  for (const [at, track] of tracks.entries()) {
    const disc = track.disc ?? 1;
    const match = found[at];
    if (match !== undefined) {
      const song = owned[match] as Owned;
      lastNumber = song.track ?? match + 1;
      lastDisc = song.discNumber ?? disc;
      continue;
    }
    const number = lastDisc === disc && lastNumber !== undefined ? lastNumber + 1 : 1;
    lastNumber = number;
    lastDisc = disc;
    out.push({
      ...track,
      position: at + 1,
      number,
      disc,
      before: found.slice(at + 1).find((index) => index !== undefined) ?? owned.length,
    });
  }
  return out;
}

export const missingTracks = (owned: Owned[], tracks: AlbumTrack[]): AlbumTrack[] => placeMissing(owned, tracks);
