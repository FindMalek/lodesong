# Discovery epic: status

Tracking for [#10](https://github.com/FindMalek/lodesong/issues/10).

| stage | what | state |
|---|---|---|
| 1 | radio and stats from Navidrome data (`getSimilarSongs2`, `getTopSongs`, scrobbles) | shipped ([radio](../mixes.md), stats, recap) |
| 2 | AudioMuse-AI: similarity, smart shuffle, energy/mood/BPM features | shipped ([#56](https://github.com/FindMalek/lodesong/issues/56)) |
| 3 | Groq: mood names, playlists from a prompt, daily / weekly mixes | shipped ([mixes](../mixes.md)) |
| 4 | aura: monochrome generated visuals per playlist | shipped for playlists and lyrics; energy, valence and BPM from AudioMuse drive it when the server has them |

## Left

- day-parted and mood mixes using audio features rather than artist moods only
- Sonaraem-style clustering over the feature space (see [mixes](../mixes.md#made-for-you-home))

These are follow-ups, not part of the epic's four stages.
