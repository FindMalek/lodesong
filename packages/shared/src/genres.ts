import { z } from "zod";

export const inferredGenreSchema = z.object({
  name: z.string(),
  albums: z.number().int(),
  songs: z.number().int(),
});
export type InferredGenre = z.infer<typeof inferredGenreSchema>;

export const inferredGenresSchema = z.object({
  watching: z.boolean().describe("Artist genres are looked up (`MUSICBRAINZ_URL` is set)"),
  untagged: z.object({ albums: z.number().int(), songs: z.number().int() }).describe("Albums and songs whose files carry no genre tag"),
  pending: z.number().int().describe("Artists of untagged albums not looked up yet"),
  genres: z.array(inferredGenreSchema).describe("Genres of the artists of untagged albums; never replaces a real tag"),
});
export type InferredGenres = z.infer<typeof inferredGenresSchema>;
