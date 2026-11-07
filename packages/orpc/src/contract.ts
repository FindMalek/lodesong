import { inferredGenresSchema } from "@lodesong/shared/genres";
import { albumSchema, mixSchema, songSchema } from "@lodesong/shared/library";
import {
  coverSchema,
  idSchema,
  importSchema,
  nameSchema,
  playlistFolderSchema,
  playlistFoldersSchema,
} from "@lodesong/shared/playlist-folders";
import { followSchema, newReleaseSchema } from "@lodesong/shared/releases";
import { listeningStatsSchema } from "@lodesong/shared/stats";
import { fitReasonSchema } from "@lodesong/shared/vibe-fit";
import { oc } from "@orpc/contract";
import { z } from "zod";

// The API contract: `apps/api` implements it; the same procedures are plain HTTP under `/api` for integrations.
// Numbers are `z.coerce`: over HTTP they arrive as query strings, over RPC as numbers.

const DAY = 86_400_000;
const tz = z.coerce.number().int().min(-840).max(840);
const ok = z.object({ ok: z.literal(true) });
/** A song as the server keeps it: whatever the client sent, at least an id. */
const songRef = z.looseObject({ id: z.string() });
const playSchema = z.object({
  song: songRef,
  started: z.number().describe("ms since the epoch"),
  listened: z.number().describe("Seconds actually listened"),
  skipped: z.boolean().describe("Left within 30 s without finishing"),
  client: z.string(),
});
const momentSchema = z.object({ id: z.number(), song: songSchema, at: z.number(), note: z.string(), created: z.number() });
const settingsSchema = z.object({ settings: z.record(z.string(), z.unknown()).nullable(), updated: z.number() });
const prefsSchema = z.object({
  songs: z.array(
    z.object({
      id: z.string(),
      song: songRef.nullable(),
      trimStart: z.number().nullable(),
      trimEnd: z.number().nullable(),
      never: z.boolean(),
      hidden: z.boolean(),
    }),
  ),
  albums: z.array(z.object({ id: z.string(), name: z.string(), keepOrder: z.boolean(), never: z.boolean() })),
});
const bansSchema = z.object({ songs: z.array(songRef) });
const hiddenSchema = z.object({ songs: z.array(z.string()).describe("Song ids") });

export const contract = {
  version: oc.route({ method: "GET", path: "/version", summary: "The running version", tags: ["Server"] }).output(
    z.object({
      version: z.string(),
      /** Admins only, when the server checks for releases (`UPDATE_CHECK=on`). */
      latest: z.string().nullable(),
      updateAvailable: z.boolean(),
    }),
  ),

  stats: {
    range: oc
      .route({
        method: "GET",
        path: "/stats",
        summary: "Your listening in a time range",
        description:
          "From your plays in lodesong: minutes, top songs, artists, albums and genres, a listening clock and day totals. At most 400 days.",
        tags: ["Stats"],
      })
      .input(
        z
          .object({
            from: z.coerce.number().describe("Start, ms since the epoch"),
            to: z.coerce.number().describe("End, ms since the epoch"),
            tz: tz.default(0).describe("Minutes east of UTC, for days and hours"),
          })
          .refine((range) => range.from < range.to, "from before to")
          .transform((range) => ({ ...range, from: Math.max(range.from, range.to - 400 * DAY) })),
      )
      .output(listeningStatsSchema),
    forgotten: oc
      .route({ method: "GET", path: "/stats/forgotten", summary: "Favourites you haven't played in a while", tags: ["Stats"] })
      .input(z.object({ days: z.coerce.number().int().min(1).max(3650).default(60).describe("Not played in this many days") }))
      .output(z.object({ songs: z.array(songSchema) })),
  },

  mixes: oc
    .route({
      method: "GET",
      path: "/mixes",
      summary: "Everything made for you right now",
      description: "Daily mixes, discover weekly, the daylist, release radar, on this day, and with Groq the mood and weekly playlists.",
      tags: ["Mixes"],
    })
    .input(
      z.object({
        day: z.coerce.number().int().describe("Your local days since the epoch"),
        hour: z.coerce.number().int().min(0).max(23).describe("Your local hour"),
        tz: tz.describe("Your getTimezoneOffset(), in minutes"),
      }),
    )
    .output(z.object({ day: z.number(), mixes: z.array(mixSchema) })),

  follows: {
    list: oc
      .route({
        method: "GET",
        path: "/follows",
        summary: "Artists you follow",
        description: "The artists you play most are followed for you; follow, pin or unfollow any artist by name.",
        tags: ["Releases"],
      })
      .output(z.object({ artists: z.array(followSchema) })),
    set: oc
      .route({ method: "PUT", path: "/follows", summary: "Follow, pin or unfollow an artist", tags: ["Releases"] })
      .input(z.object({ name: z.string().trim().min(1).max(200), status: z.enum(["followed", "pinned", "unfollowed"]) }))
      .output(z.object({ artists: z.array(followSchema) })),
    sync: oc
      .route({
        method: "POST",
        path: "/follows/sync",
        summary: "Follow the artists you follow on Spotify",
        description:
          "Admins only, with Lyterion set up. Follows each artist Lyterion has from your Spotify; never unfollows, and skips artists you unfollowed here.",
        tags: ["Releases"],
      })
      .output(z.object({ added: z.number(), total: z.number(), artists: z.array(followSchema) })),
  },

  releases: {
    list: oc
      .route({
        method: "GET",
        path: "/releases",
        summary: "New releases by artists you follow",
        description:
          "Albums, EPs and singles from the last 90 days that aren't in your library, from MusicBrainz, checked weekly. Empty when `MUSICBRAINZ_URL` is empty.",
        tags: ["Releases"],
      })
      .output(z.object({ releases: z.array(newReleaseSchema), watching: z.boolean().describe("The weekly check is on") })),
    seen: oc
      .route({ method: "POST", path: "/releases/seen", summary: "Mark releases as seen", tags: ["Releases"] })
      .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }))
      .output(ok),
    get: oc
      .route({
        method: "POST",
        path: "/releases/{id}/get",
        summary: "Hand a release to Lyterion",
        description: "Admins only, with Lyterion set up. Lyterion fetches, tags and places it; Navidrome picks it up on its next scan.",
        tags: ["Releases"],
      })
      .input(z.object({ id: z.string().min(1) }))
      .output(ok),
  },

  genres: {
    inferred: oc
      .route({
        method: "GET",
        path: "/genres/inferred",
        summary: "Genres guessed for albums that have none",
        description:
          "Albums and songs with no genre tag, and genres of their artists from MusicBrainz (cached, looked up in the background). Empty when `MUSICBRAINZ_URL` is empty. With `genre`, also lists the untagged albums by artists in that genre.",
        tags: ["Library"],
      })
      .input(z.object({ genre: z.string().optional() }))
      .output(inferredGenresSchema.extend({ albums: z.array(albumSchema) })),
  },

  artists: {
    appearsOn: oc
      .route({
        method: "GET",
        path: "/artists/{id}/appears-on",
        summary: "Albums by others an artist appears on",
        description: "Features, compilations and soundtracks, from the library index, in the folders you may see.",
        tags: ["Library"],
      })
      .input(z.object({ id: z.string().min(1) }))
      .output(z.object({ albums: z.array(albumSchema) })),
  },

  history: {
    list: oc
      .route({ method: "GET", path: "/history", summary: "Your plays, newest first", tags: ["History"] })
      .input(
        z.object({
          before: z.coerce.number().optional().describe("Only plays that started before this, ms since the epoch (paging)"),
          limit: z.coerce.number().int().min(1).max(500).default(200),
        }),
      )
      .output(z.object({ plays: z.array(playSchema) })),
    add: oc
      .route({
        method: "POST",
        path: "/history",
        summary: "Record a play that just ended",
        description: "What stats, mixes and recaps are made from. Plays from the player itself are recorded already.",
        tags: ["History"],
      })
      .input(
        z.object({
          song: songRef,
          started: z.number().describe("ms since the epoch"),
          listened: z.number().min(0).lt(86_400).describe("Seconds actually listened"),
          finished: z.boolean().default(false).describe("Whether it played to its end"),
        }),
      )
      .output(ok),
  },

  moments: {
    list: oc
      .route({ method: "GET", path: "/moments", summary: "Your moments: a point in a song, with a note", tags: ["Moments"] })
      .input(z.object({ song: z.string().optional().describe("Only this song's") }))
      .output(z.object({ moments: z.array(momentSchema) })),
    add: oc
      .route({ method: "POST", path: "/moments", successStatus: 201, summary: "Save a moment", tags: ["Moments"] })
      .input(
        z.object({ song: songSchema, at: z.number().min(0).max(86_400).describe("Seconds into the song"), note: z.string().default("") }),
      )
      .output(momentSchema),
    update: oc
      .route({ method: "PATCH", path: "/moments/{id}", summary: "Change a moment's note", tags: ["Moments"] })
      .input(z.object({ id: z.coerce.number().int(), note: z.string() }))
      .output(ok),
    remove: oc
      .route({ method: "DELETE", path: "/moments/{id}", summary: "Delete a moment", tags: ["Moments"] })
      .input(z.object({ id: z.coerce.number().int() }))
      .output(ok),
  },

  settings: {
    get: oc.route({ method: "GET", path: "/settings", summary: "Your synced settings", tags: ["Settings"] }).output(settingsSchema),
    put: oc
      .route({
        method: "PUT",
        path: "/settings",
        summary: "Replace your synced settings",
        description: "A JSON object, under 8 KB.",
        tags: ["Settings"],
      })
      .input(z.record(z.string(), z.unknown()).refine((body) => JSON.stringify(body).length <= 8192, "under 8 KB"))
      .output(settingsSchema),
  },

  prefs: {
    get: oc
      .route({
        method: "GET",
        path: "/prefs",
        summary: "Your playback rules",
        description: "Per song: trims, never in shuffle or radio, hidden. Per album: keep in order, never in shuffle.",
        tags: ["Prefs"],
      })
      .output(prefsSchema),
    song: oc
      .route({ method: "PUT", path: "/prefs/songs/{id}", summary: "Change a song's rules (the fields sent)", tags: ["Prefs"] })
      .input(
        z.object({
          id: z.string().min(1),
          song: songRef.nullable().optional().describe("The song itself, kept so the rule shows without the library"),
          trimStart: z.number().nullable().optional().describe("Seconds; null clears it"),
          trimEnd: z.number().nullable().optional().describe("Seconds; null clears it"),
          never: z.boolean().optional(),
          hidden: z.boolean().optional(),
        }),
      )
      .output(prefsSchema),
    album: oc
      .route({ method: "PUT", path: "/prefs/albums/{id}", summary: "Change an album's rules (the fields sent)", tags: ["Prefs"] })
      .input(
        z.object({ id: z.string().min(1), name: z.string().optional(), keepOrder: z.boolean().optional(), never: z.boolean().optional() }),
      )
      .output(prefsSchema),
  },

  radio: {
    bans: oc.route({ method: "GET", path: "/radio/bans", summary: "Songs no radio plays for you", tags: ["Radio"] }).output(bansSchema),
    ban: oc
      .route({ method: "POST", path: "/radio/bans", summary: "Keep a song out of every radio", tags: ["Radio"] })
      .input(z.object({ song: songRef }))
      .output(bansSchema),
    unban: oc
      .route({ method: "DELETE", path: "/radio/bans/{id}", summary: "Let a song back into radios", tags: ["Radio"] })
      .input(z.object({ id: z.string().min(1) }))
      .output(bansSchema),
  },

  playlists: {
    forMood: oc
      .route({
        method: "GET",
        path: "/playlists/mood",
        summary: "Your playlists that fit a mood",
        description:
          "Words like gym or melancholy. Ranked by how close the playlist's songs are to the mood's AudioMuse-AI profile (energy, valence, bpm) plus its name; without AudioMuse-AI only the name counts. At most 8, each with the reasons it matched. `complete` is false while the server is still reading your playlists: ask again shortly.",
        tags: ["Playlists"],
      })
      .input(z.object({ mood: z.string().trim().min(1).max(40) }))
      .output(
        z.object({
          mood: z.string().describe("The mood the words mean, empty when they mean none"),
          playlists: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                reasons: z.array(fitReasonSchema).max(4),
                fit: z.number().min(0).max(1).nullable().describe("How close its songs are to the mood, null when only the name matched"),
                analysed: z.number().int().describe("Songs with AudioMuse-AI features"),
              }),
            )
            .max(8),
          complete: z.boolean(),
        }),
      ),
    hidden: oc
      .route({ method: "GET", path: "/playlists/{id}/hidden", summary: "Songs you hid in a playlist", tags: ["Playlists"] })
      .input(z.object({ id: z.string().min(1) }))
      .output(hiddenSchema),
    hide: oc
      .route({ method: "PUT", path: "/playlists/{id}/hidden", summary: "Hide or show a song in a playlist", tags: ["Playlists"] })
      .input(z.object({ id: z.string().min(1), songId: z.string().min(1), hidden: z.boolean() }))
      .output(hiddenSchema),
  },

  folders: {
    list: oc
      .route({
        method: "GET",
        path: "/folders",
        summary: "Your playlist folders",
        description:
          "Folders live in lodesong, not Navidrome: playlist names are never changed. `items` says which folder a playlist is in. " +
          "A folder's picture is not in this list: `coverVersion` says there is one, and it is at `/folders/{id}/cover`.",
        tags: ["Playlist folders"],
      })
      .output(playlistFoldersSchema),
    create: oc
      .route({ method: "POST", path: "/folders", successStatus: 201, summary: "Make a folder", tags: ["Playlist folders"] })
      .input(z.object({ name: nameSchema, parentId: idSchema.nullable().default(null) }))
      .output(playlistFolderSchema),
    update: oc
      .route({
        method: "PATCH",
        path: "/folders/{id}",
        summary: "Rename, move or give a folder a cover (the fields sent)",
        description:
          "Nesting stops at 4 levels. The cover is a png, jpeg or webp data URL, at most 56 KB and 1024 px a side; null goes back to the generated aura. " +
          "Not in the public demo.",
        tags: ["Playlist folders"],
      })
      .input(
        z.object({
          id: idSchema,
          name: nameSchema.optional(),
          parentId: idSchema.nullable().optional(),
          cover: coverSchema.nullable().optional(),
        }),
      )
      .output(playlistFolderSchema),
    remove: oc
      .route({
        method: "DELETE",
        path: "/folders/{id}",
        summary: "Delete a folder",
        description: "What is inside moves up one level; no playlist is deleted.",
        tags: ["Playlist folders"],
      })
      .input(z.object({ id: idSchema }))
      .output(ok),
    place: oc
      .route({
        method: "PUT",
        path: "/playlists/{id}/folder",
        summary: "Put a playlist in a folder, or back at the top with null",
        tags: ["Playlist folders"],
      })
      .input(z.object({ id: idSchema, folderId: idSchema.nullable() }))
      .output(ok),
    import: oc
      .route({
        method: "POST",
        path: "/folders/import",
        successStatus: 201,
        summary: "Make several nested folders and fill them with playlists, all or nothing",
        tags: ["Playlist folders"],
      })
      .input(importSchema)
      .output(ok),
  },

  lyrics: {
    offset: oc
      .route({ method: "GET", path: "/lyrics/{songId}/offset", summary: "Your timing nudge for a song's lyrics", tags: ["Lyrics"] })
      .input(z.object({ songId: z.string().min(1) }))
      .output(z.object({ offset: z.number().describe("ms; positive shows lines later") })),
    setOffset: oc
      .route({ method: "PUT", path: "/lyrics/{songId}/offset", summary: "Nudge a song's lyrics timing", tags: ["Lyrics"] })
      .input(z.object({ songId: z.string().min(1), offset: z.number().min(-60_000).max(60_000).describe("ms") }))
      .output(ok),
  },
};

export type Contract = typeof contract;
