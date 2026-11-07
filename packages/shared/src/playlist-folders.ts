import { z } from "zod";

export const MAX_FOLDER_DEPTH = 4;
export const MAX_COVER_LENGTH = 80_000;

export const playlistFolderSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  cover: z.string().nullable().describe("An uploaded image as a data URL; null shows the generated aura"),
});

export const folderItemSchema = z.object({ playlistId: z.string(), folderId: z.string() });

export const playlistFoldersSchema = z.object({ folders: z.array(playlistFolderSchema), items: z.array(folderItemSchema) });

export type PlaylistFolder = z.infer<typeof playlistFolderSchema>;
export type FolderItem = z.infer<typeof folderItemSchema>;
export type PlaylistFolders = z.infer<typeof playlistFoldersSchema>;

export const coverSchema = z
  .string()
  .max(MAX_COVER_LENGTH)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
