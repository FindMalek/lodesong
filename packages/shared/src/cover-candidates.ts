import { z } from "zod";

/** `archive:` is a MusicBrainz release group on Cover Art Archive; `deezer:` and `deezer-artist:` are Deezer ids. */
export const CANDIDATE_ID =
  /^(archive:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|deezer:\d{1,15}|deezer-artist:\d{1,15})$/;
export const COVER_ID = /^[A-Za-z0-9_.:-]{1,100}$/;

export const coverCandidateSchema = z.object({
  id: z.string().regex(CANDIDATE_ID),
  source: z.enum(["archive", "deezer"]),
  title: z.string().describe("What the source calls it, with the artist"),
  size: z.number().int().describe("Pixels on a side of the picture that would be kept"),
  thumb: z.string().describe("A small preview as a data URL"),
});
export type CoverCandidate = z.infer<typeof coverCandidateSchema>;

export const coverOverrideSchema = z.object({
  id: z.string().describe("The cover id Navidrome gave"),
  version: z.string().describe("Changes when the picture does; add it to the cover url as `?v=`"),
});
