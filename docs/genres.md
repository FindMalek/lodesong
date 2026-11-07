# Genres

The genres page lists what Navidrome's `getGenres` knows, and that is only what is written in the files' tags. A song
with no `GENRE` tag is in no genre. Most libraries have plenty of those: Lyterion writes `GENRE` (the top three Spotify
genres of the artist) only on files it places itself, and older files have nothing.

## What lodesong shows

- **How many have no genre.** Under the tag genres, the page says how many songs, in how many albums, carry no genre tag
  and that they are in no genre above. It counts from the [library index](search.md), so it needs the index to have synced.
- **Inferred genres.** With `MUSICBRAINZ_URL` set (the default), the artist of every album without a genre is looked up on
  MusicBrainz and its top three genres are kept. They are listed apart, under "inferred from artists", in a lighter
  badge, with the number of albums. A genre page shows those albums in their own "inferred" section below the tagged ones.
- **Never over a real tag.** Inferred genres are never mixed into the tag genres and never written to a file or to
  Navidrome. An album with any genre tag is left alone.

Lookups run in the background, one request a second like the [new releases](mixes.md) check, and are cached in
lodesong's database for 90 days (artists MusicBrainz doesn't know are cached too). The page fills in as they finish. With
`MUSICBRAINZ_URL` empty nothing is looked up: you still get the count, without the inferred genres.

## Getting real tags

Inferred genres are a stopgap. To get tags into the files:

- Let [Lyterion](lyterion.md) backfill `GENRE` on files it didn't write. That part lives in the Lyterion repository and
  lodesong depends on it; until it lands, only files Lyterion placed itself have a genre.
- Or tag them yourself (beets, Picard, your tagger of choice).

## How Navidrome picks up changed tags

Navidrome re-reads a file when it sees it changed, in its next scan:

- It scans on a schedule (`ND_SCANSCHEDULE`) and, where the filesystem reports changes, soon after a file changes.
  Changed tags are picked up by that scan; genres, counts and the genres page follow.
- A scan only looks at files whose modification time moved. A tagger that keeps the old modification time, or a bind
  mount that hides changes, is not seen: run a **full scan** (Navidrome's own UI, or `navidrome scan --full`).
- lodesong's search index syncs after every Navidrome scan, so the untagged count and the inferred genres follow a
  rescan too. Hit **rebuild now** in the user menu (admins) to force it.
- The genres page itself is cached for up to five minutes in the browser.
