# iPhone audio: engine and formats

## Engine

`AVQueuePlayer`, holding the current song and the next one.

- It streams over HTTP with byte ranges, plays Ogg Opus, runs in the background and starts a queued item without a gap.
- `AVAudioEngine` would give crossfade and EQ, but has no streaming of its own: we would download and schedule
  buffers ourselves, including for a file still arriving. Not worth it for the first version.
- ReplayGain sets the player volume per song (album gain when an album plays in order, else track gain). It only
  turns down.
- Not there: crossfade, EQ.

## Formats

Measured on the iOS 27.2 simulator with 30 s test tones, not on a phone and not on iOS 26.

| file | local | HTTP with ranges |
|---|---|---|
| Ogg Opus (`.opus`, `.ogg`) | plays | plays |
| Ogg Opus (`.oga`, no extension with the MIME type given) | plays | not tried |
| Ogg Opus, no extension and no MIME type | fails | |
| Ogg Vorbis | fails | fails |
| MP3, FLAC, AAC in `.m4a` | plays | plays |
| ALAC, AAC (`.aac`), AIFF, AAC in `.caf` | plays | not tried |
| WAV | plays | plays |
| WebM Opus, WMA | fails | not tried |

Without byte ranges (what a live transcode looks like) MP3 and Ogg Opus start; FLAC and `.m4a` fail.

## What the player asks the server for

1. The downloaded file, when there is one.
2. `/rest/stream?format=raw` for `mp3 m4a m4b mp4 aac alac flac wav aif aiff caf opus ogg oga`.
3. `/rest/stream?format=mp3&maxBitRate=320` for every other suffix, and for any song whose file or original failed
   to open (an `.ogg` that turns out to be Vorbis).

A download of a format outside the list in 2 has to be a transcode, or it will not play offline. `ogg` and `oga`
may hold Vorbis, which only streams.
