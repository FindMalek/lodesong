import { z } from "zod";

export const followSchema = z.object({
  name: z.string(),
  status: z
    .enum(["auto", "followed", "pinned"])
    .describe("auto: one of the artists you play most; pinned: kept even when you stop playing them"),
});
export type Follow = z.infer<typeof followSchema>;
export type FollowStatus = Follow["status"];

export const newReleaseSchema = z.object({
  id: z.string().describe("MusicBrainz release group id"),
  artist: z.string(),
  title: z.string(),
  kind: z.string().describe("album, ep or single"),
  date: z.string().describe("YYYY-MM-DD, or YYYY-MM"),
  url: z.string(),
  requested: z.boolean().describe("Already handed to Lyterion"),
  canGet: z.boolean().describe("Lyterion is set up and you may use it"),
});
export type NewRelease = z.infer<typeof newReleaseSchema>;
