# Mixes and playlists made for you

Everything here is made from **your** library and what you play in lodesong, and saved as ordinary Navidrome
playlists, so your phone and every other Subsonic app have them too.

## Made for you (home)

| | what | changes |
|---|---|---|
| **daily mix 1–6** | each starts from an artist you play a lot and takes in the artists you play around the same time (within two hours); about half songs you play, half theirs you rarely or never do | every day at your midnight |
| **discover weekly** | 30 songs you own and never played: most by artists you play (the ones you play most count most, and artists you follow with a new release come first), the rest by artists you've never played | every Friday |
| **daylist** | what you tend to play at this time of day, plus songs by the same artists you haven't | morning, afternoon, evening, night |
| **release radar** | songs added to your library in the last month by artists you play, newest first | as songs arrive |
| **on this day** | what you played around this date a year ago, most played first | every day |
| **focus mix, late night mix, energy mix** | with `GROQ_API_KEY`: Groq sorts the artists you play into moods once a week (one call, cached), and each mix is a fresh blend of their songs every day | every day |
| **… · weekly** | with `GROQ_API_KEY`, after [Sonaraem](https://github.com/FindMalek/sonaraem): up to five playlists Groq names and fills by grouping the artists you play by shared sound and mood; no artist takes over a list | every week |

They need some listening history first (a few days of plays). A card opens its playlist; the play button on a card
starts it. Plays are matched to the library by artist and title, so a tagger moving files doesn't lose your history.
Songs marked "never in shuffle or radio" are left out.

## New from artists you follow

The artists you play most (the top 15 of the last 90 days) are followed for you. Once a week lodesong asks
[MusicBrainz](https://musicbrainz.org) for their new albums, EPs and singles (live albums, compilations and the like
are left out), and the bottom of home lists the ones from the last three months that aren't in your library yet, with
the release date and a link. Only artist names leave your server, one request a second with a lodesong user agent,
and answers are kept, so a release is looked up once.

**following** on that row opens the list: follow any artist by name, **pin** one so it stays when you stop playing
them, or **unfollow** one for good (an unfollowed artist isn't followed automatically again). Following an artist
looks them up right away. The artist has to be an exact match on MusicBrainz; when two artists share a name, none is
picked.

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
