import { z } from "zod";
import { ID, LIMITS } from "./share-card";

export const cardSchema = z.object({
  kind: z.enum(["album", "artist", "playlist", "song"]),
  title: z.string().min(1).max(LIMITS.title),
  subtitle: z.string().max(LIMITS.subtitle).optional(),
  stats: z.string().max(LIMITS.stats),
  covers: z.array(z.string().regex(ID)).max(4),
});
