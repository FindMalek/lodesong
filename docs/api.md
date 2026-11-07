# API

Everything the player does is one API, typed end to end: the procedures are defined once in `packages/orpc`
(Zod schemas for every input and output), the server implements them, and the player calls them through a client typed
from the same definitions.

For your own integrations (a status bar, a stream deck, a script, another app):

- **Reference:** `https://your-player/api`: every procedure with its parameters and responses, and a playground.
- **Spec:** `https://your-player/api/spec.json` (OpenAPI 3), for generating a client in any language.
- **Sign in:** settings → sync → **api token** → make one (a sign-in of its own, listed under settings → account →
  sessions, where you can sign it out). Send it as `Authorization: Bearer <token>`. The terminal's now-playing token
  is not one: it only reaches `/api/remote/*`.

```sh
curl -H "Authorization: Bearer $TOKEN" "https://your-player/api/stats/forgotten?days=90"
```

| path | what |
|---|---|
| `GET /api/version` | the running version |
| `GET /api/stats?from&to&tz` | your listening in a range |
| `GET /api/stats/forgotten?days` | favourites you haven't played in a while |
| `GET /api/mixes?day&hour&tz` | everything made for you right now |
| `GET /api/follows`, `PUT /api/follows` | artists you follow; follow, pin or unfollow one |
| `POST /api/follows/sync` | follow the artists you follow on Spotify, through Lyterion (admins) |
| `GET /api/releases`, `POST /api/releases/{id}/get` | new releases by artists you follow; hand one to Lyterion |
| `GET /api/genres/inferred?genre` | songs with no genre tag, and genres of their artists from MusicBrainz ([genres](genres.md)) |
| `GET /api/folders`, `POST /api/folders` | your playlist folders (picture versions, not the pictures) and the playlist each holds; make one |
| `PATCH /api/folders/{id}`, `DELETE /api/folders/{id}` | rename, move or set the picture of a folder (png, jpeg or webp, 56 KB and 1024 px at most); delete one, what is inside moves up. Neither is allowed in the public demo |
| `GET /api/folders/{id}/cover` | a folder's picture, with an `ETag` (`304` when you have it); `404` when it has none or isn't yours |
| `PUT /api/playlists/{id}/folder` | put a playlist in a folder, or back at the top with `folderId: null` |
| `POST /api/folders/import` | make a nested set of folders and fill them with playlists (2000 in all), all or nothing |
| `GET /api/artists/{id}/appears-on` | albums by others an artist appears on |
| `GET /api/playlists/mood?mood` | your playlists that fit a mood like `gym`, ranked, with why ([search](search.md#moods)) |
| `GET /api/remote/now`, `POST /api/remote/toggle·next·previous` | what's playing, and play/pause/skip ([devices](devices.md)) |

More of the player moves onto the typed API release by release; the reference always lists what's there. Library data
itself (albums, artists, playlists, streams) is Navidrome's own [Subsonic API](https://opensubsonic.netlify.app), which
lodesong proxies at `/rest/*` for its signed-in browsers.
