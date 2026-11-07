# Search

`⌘K` (or `/`) opens search from anywhere; `↵` on a result plays it, `⌘↵` opens the full results page.

lodesong searches its own index on the server (SQLite FTS5 over your whole library and its lyrics), not
Navidrome's search, so it forgives what Navidrome's doesn't:

| you type | it finds |
|---|---|
| `radiohed` | Radiohead (typos) |
| `okcomputer` | OK Computer (missing spaces) |
| `beyonce`, `sigur ros` | Beyoncé, Sigur Rós (accents) |
| `acdc` | AC/DC (punctuation) |
| `daft punk - one more time`, `one more time by daft punk` | that song, with the artist and title split for you |
| `i'm counting the stars` | the song with that line, and playing it **starts at that line** |

Results are grouped (top result, songs, albums, artists, lyrics) and ranked: exact title or artist first, then
prefix, word and fuzzy matches. Within those, songs you like and play often come first. A lyrics match never
outranks a song whose title matches.

## Filters

Add these to any search; each shows as a chip you can remove.

| filter | example |
|---|---|
| `artist:` | `artist:"massive attack"` |
| `album:` | `album:mezzanine` |
| `genre:` | `genre:trip-hop` |
| `year:` | `year:1998`, `year:1990..1999`, `year:..1980` |
| `format:` | `format:flac` |
| `is:liked`, `is:unplayed` | `is:liked year:2020..` |
| `bpm:`, `energy:`, `mood:` | `bpm:120..130`, `energy:high` (`low`, `mid`, `high` or `0.6..`), `mood:chill` (`upbeat`, `chill`, `intense`, `sad`). Songs only, and only once [AudioMuse-AI](configuration.md) (`AUDIOMUSE_URL`) has analysed them |
| `lyrics:` | `lyrics: counting the stars` (only lyrics; the rest of the text is the phrase) |

Filters alone work too: `genre:jazz year:1950..1965` lists the most played matches.

## Moods

Type a mood in `⌘K` (`gym`, `workout`, `melancholy`, `rainy days`, `focus`, `late night`, `chill`, `party`, `happy`, a few
french words too) and a "for gym" group shows up once the search has settled, after the top result and before the songs.
It has a mix, your playlists that fit and the genres that fit. Whole words match (`Runaway` is not a gym
playlist, `Train` is still a band), and a half typed word needs 6 letters (`melanc`).

Playlists are ranked by how their songs sound, plus their name. Each mood is a profile of AudioMuse-AI features (gym is
energy 0.7+ and 110+ bpm, melancholy is low energy and low valence). A song fits when every feature the profile
cares about is in range, fading to nothing over a small margin outside it; a playlist's score is the average over its
analysed songs. It is listed when the score is at least 0.65 and at least half of its songs (and at least 3, or all of
them in a playlist shorter than 3) are analysed, or when its name fits. Its rank is the score times the share of its
songs that are analysed (a playlist with 5 of 10 analysed counts half), plus 0.5 for a name match; ties go by name, then
id. Each playlist says why in its second line: `name fits, loud, fast`. The words come from the playlist's averages
(`loud` or `quiet`, `fast` or `slow`, `bright` or `dark`, `steady`); a playlist that fits without any of them says
`fits the mood`. Without AudioMuse-AI only the name counts and the line says `name fits`.

The server does the ranking (`GET /api/playlists/mood?mood=gym`, at most 8 playlists, from the ones you can see in Navidrome, and the palette shows the first 4 of them). It
reads each playlist's songs from Navidrome once and again only when Navidrome says the playlist changed (a playlist
over 2000 songs counts its first 2000). The first search after a lot of new playlists can take a few seconds while they
are read; the palette shows the name matches meanwhile and fills in the ranking as it arrives, asking again every 3
seconds up to 5 times. A playlist Navidrome fails to give 3 times in a row is left out for 10 minutes so it can't hold
the answer back. The answer is cached for
10 minutes per account and mood, and refreshed sooner when your playlists change or AudioMuse-AI analyses songs.

The mix uses the `bpm:` / `energy:` / `mood:` filters above when AudioMuse-AI has analysed your songs (gym is high energy
and 110+ bpm; melancholy is `mood:sad`, rainy days is `energy:low`). The filters alone always give your most played 50,
so each matching genre adds its own pool, and the mix plays shuffled. With fewer than 20 analysed matches it is topped up
with songs from the matching genres, which also carries it when AudioMuse-AI is off. Without AudioMuse-AI and without a matching genre there is no mix option.
The words and profiles live in `packages/shared/src/vibes.ts`.

## Search inside a list

`⌘F` on an album, playlist, liked songs, the queue or any song list filters that list in place.

## The index

The server builds it as one account (`INDEX_USER`/`INDEX_PASSWORD`, else the admin who signed in most recently),
syncs after every Navidrome scan and once a day, and only ever returns what the person searching may see (music
folders per user). Admins: user menu → library index shows the counts and a "rebuild now" button. Lyrics become
searchable as they're fetched ([lyrics](lyrics.md)); search says how many are indexed so far.
