import { z } from "zod";

export const MAX_FOLDER_DEPTH = 4;
export const MAX_FOLDERS = 200;
export const MAX_DEMO_FOLDERS = 10;
export const MAX_FOLDER_ITEMS = 2000;
export const MAX_NAME_LENGTH = 80;
export const MAX_ID_LENGTH = 64;
export const MAX_COVER_BYTES = 56_000;
export const MAX_COVER_LENGTH = 80_000;
export const MAX_COVER_SIDE = 1024;

export const idSchema = z.string().min(1).max(MAX_ID_LENGTH);
export const nameSchema = z.string().min(1).max(MAX_NAME_LENGTH);

export const playlistFolderSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  name: nameSchema,
  coverVersion: z
    .string()
    .nullable()
    .describe("Changes when the picture does; null shows the generated aura. The picture is at /folders/{id}/cover"),
});

export const folderItemSchema = z.object({ playlistId: idSchema, folderId: idSchema });

export const playlistFoldersSchema = z.object({ folders: z.array(playlistFolderSchema), items: z.array(folderItemSchema) });

export type PlaylistFolder = z.infer<typeof playlistFolderSchema>;
export type FolderItem = z.infer<typeof folderItemSchema>;
export type PlaylistFolders = z.infer<typeof playlistFoldersSchema>;

export const coverSchema = z
  .string()
  .max(MAX_COVER_LENGTH)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const importSchema = z.object({
  parentId: idSchema.nullable(),
  folders: z
    .array(
      z.object({
        parent: z.number().int().min(0).nullable().describe("Index of an earlier entry in this list; null puts it under parentId"),
        name: nameSchema,
        playlists: z.array(idSchema).max(MAX_FOLDER_ITEMS),
      }),
    )
    .min(1)
    .max(MAX_FOLDERS),
});

export type FolderImport = z.infer<typeof importSchema>;

export const FOLDER_REASONS = ["missing", "invalid", "too deep", "too many", "bad picture"] as const;
export type FolderReason = (typeof FOLDER_REASONS)[number];
