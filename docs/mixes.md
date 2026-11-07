# Mixes and playlists made for you

Everything here is made from **your** library and what you play in lodesong, and saved as ordinary Navidrome
playlists, so your phone and every other Subsonic app have them too.

## Made for you (home)

| | what | changes |
|---|---|---|
| **daily mix 1–6** | each starts from an artist you play a lot and takes in up to 15 artists: the five you play closest to it (within two hours), then the artists next to those, who count for less. Songs go in turns, one artist after another, and no artist takes more than a fifth unless nothing else is left. Within an artist, songs you liked in navidrome or replay come first, songs you often skip sink (a single skip barely counts), and songs you haven't heard in a while come before ones you just played. A star added later counts from tomorrow, and if navidrome doesn't answer within two seconds the mix is made without likes and made again with them on the next visit. Between 40% and 85% are songs you have played, the more you repeat songs the more; half of the rest is a discovery lane: songs you never played by artists next to the mix (played near it, or the closest in sound once [AudioMuse-AI](configuration.md) has analysed the library) | every day at your midnight, and the same all day on every device; the last three days' songs are pushed down, and the artists they start from rotate through your top ones each week |
| **discover weekly** | 30 songs you own and never played: most by artists you play (the ones you play most count most, and artists you follow with a new release come first), the rest by artists you've never played | every Friday |
| **daylist** | what you tend to play at this time of day, plus songs by the same artists you haven't; songs go in turns, and no artist takes more than a fifth unless nothing else is left; likes count here too, and a new star shows within ten minutes | morning, afternoon, evening, night |
| **release radar** | songs added to your library in the last month by artists you play, newest first | as songs arrive |
| **on this day** | what you played around this date a year ago, most played first | every day |
| **focus mix, late night mix, energy mix** | with `GROQ_API_KEY`: Groq sorts the artists you play into moods once a week (one call, cached), and each mix is a fresh blend of their songs every day, in turns, no artist over a fifth | every day |
| **… · weekly** | with `GROQ_API_KEY`, after [Sonaraem](https://github.com/FindMalek/sonaraem): up to five playlists Groq names and fills by grouping the artists you play by shared sound and mood; no artist takes over a list | every week |

They need some listening history first (a few days of plays). A card opens its playlist; the play button on a card
starts it. Plays are matched to the library by artist and title, so a tagger moving files doesn't lose your history. A song that exists under two ids counts once (the newest copy), and "never play" on one of them covers both.
Songs marked "never in shuffle or radio" are left out.

## New from artists you follow

The artists you play most (the top 15 of the last 90 days) are followed for you. Once a week lodesong asks
[MusicBrainz](https://musicbrainz.org) for their new albums, EPs and singles (live albums, compilations and the like
are left out), and the top of home lists the ones from the last three months that aren't in your library yet, as cards with
the type, the release date, a link and a mark for the ones you haven't seen. Only artist names leave your server, one request a second with a lodesong user agent,
and answers are kept, so a release is looked up once. Cards show the cover from [Cover Art Archive](https://coverartarchive.org)
(by release id, through your server, kept on disk); a release without one keeps its initials.

**following** (or `/following` in the sidebar) is a page: search for an artist (typos are fine, it's the same search as
the rest of the app, and a name that isn't in your library can be followed by name), see everyone you follow and sort
them (pinned first, a-z, newest release), **pin** one so it stays when you stop playing them, or **unfollow** one for
good (an unfollowed artist isn't followed automatically again). Below, the releases are grouped by week (coming up,
this week, last week, then by date), can be filtered to albums, EPs or singles, and **mark seen** (one, or all of
what's shown) is remembered per account. Following an artist looks them up right away. The artist has to be an exact
match on MusicBrainz; when two artists share a name, none is picked.

Without [Lyterion](lyterion.md#new-releases) this is a list. With it, **get it** on a release hands it over (admins),
and `RELEASES_AUTO_GET=on` does so for every new release on its own. `MUSICBRAINZ_URL` empty turns all of it off.

## Playlists from a prompt

New playlist (`⌘N`, or the `+` next to playlists) → **describe it**: "rainy sunday, slow, warm, no vocals", "90s
hip hop for a run", "music for focusing". Needs `GROQ_API_KEY` on the server.

1. Groq gets your request and a list of your artists: name, how many songs, their years and genres, and how often you
   play them. It answers with artists from that list, an era if you asked for one, and a size. It never names songs.
2. The server keeps only artists that are really in your library and builds the list from songs you own, one artist at
   a time, about half you play and half you don't.
3. You see the name, how many songs and which artists; **again** makes another, **create** saves it.

`GROQ_MODEL` picks the model (default `openai/gpt-oss-120b`), `GROQ_URL` any OpenAI-compatible API instead of Groq.

## Recap

Stats → **recap**: this month or this year as a reel. Minutes listened, your top artist and top song (with the next
four), the album on repeat, your sound, when you listen (a morning listener, a night owl), your biggest day, what was
new to you, your longest streak, and at the end your top songs, played back or saved as a playlist. ← → or tap the
sides to go through it; **save image** makes a 1080×1920 card to share.

## Radio

Start a radio from a song or an artist; 👎 drops a song from that station and keeps its artist away after two.
