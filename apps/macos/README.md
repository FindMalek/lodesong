# lodesong for macOS

The player in its own window, and an island around the notch, made to feel like it shipped with the Mac.

| | |
|---|---|
| ![compact](../../docs/macos/compact.png) | **Playing:** the cover left of the notch, bars bouncing right of it. |
| ![peek](../../docs/macos/peek.png) | **Hover:** it grows into the song, where it is, and ⏮ ⏯ ⏭. |
| ![open](../../docs/macos/open.png) | **Click:** Now Playing (seek by dragging), Lyrics (follow along, click a line to jump), Queue (click to play). Settings are in their own window (⌘,). |

- **The notch:** on by default on Macs that have one, off on the rest (a Mac mini, an external display only); switch it
  in Settings (⌘,). Without a notch there's a mini player that stays on top (⌘⇧M) and a menu bar item.
- **The bars follow the music:** the page measures four bands (bass to treble) on the audio thread and sends them ~15
  times a second, only while the island or mini player shows and a song plays; each bar eases to its band. On a song
  the page can't measure, they fall back to a gentle loop.
- **Battery:** nothing polls. The player reports changes; the playhead moves on by itself between reports and only
  while you're looking at it. Measured on an M-series Mac, playing with the window hidden: the app ~1–2 % CPU, the
  page ~6–8 % (decoding plus the audio graph; the equalizer's filters are unplugged while it's off), live bars
  included. Launch to ready: ~0.4 s.
- **Closing the window keeps the music going**; the Dock icon or ⌘1 brings it back. Media keys and Now Playing work
  through WebKit, the same as in Safari.
- **Your login** stays in the app between launches (its own WebKit store, apart from Safari's).
- **Updates over the air:** it checks GitHub's releases at launch and every few hours (when macOS says it's cheap to),
  downloads a new version in the background and asks to restart. After the restart, **What's New** lists everything
  shipped since the version you last opened, every release in between. Settings (⌘,) can turn automatic downloads off.

## Install

Download `lodesong-macos.zip` from the [latest release](https://github.com/FindMalek/lodesong/releases/latest),
unzip, move **lodesong** to Applications. It isn't signed by Apple yet: the first time, right-click it → **Open**
(or `xattr -dr com.apple.quarantine "/Applications/lodesong.app"`). It asks for your lodesong address once.
macOS 14 or later. On managed Macs, `apps/macos/pkg.sh` builds a pkg that installs through Fleet or any MDM: see
[the Fleet guide](../../docs/macos/fleet.md).

## Build

```sh
apps/macos/build.sh                                   # → apps/macos/dist/lodesong.app (Apple silicon + Intel)
swift run --package-path apps/macos Lodesong --preview /tmp/island   # the island's states as PNGs
```

No dependencies: AppKit, SwiftUI and WebKit. The page talks to the app through `apps/player/src/lib/native.ts`.

## Tests

```sh
bun scripts/build.ts            # the player the app loads, at ./dist/lodesong
swift test --package-path apps/macos
```

`swift test` starts the mock Navidrome and `./dist/lodesong` on free ports, loads the player in a WKWebView made by
`PlayerView.makeConfiguration()` (the one the app uses) and checks what the page does in this engine:

- `canPlayType` for opus, mp3, aac and flac, and the configuration the app runs with (media policy, persistent store,
  user agent).
- Sound reaching the output for original, mp3 and opus streams, through `test/output-tap.js` (the tap the e2e specs use).
- Playback started by the native bridge with no DOM tap (what the island, menu bar and media keys do). WebKit counts
  script run through `callAsyncJavaScript` as user-activated (`navigator.userActivation.isActive` is true), so this
  case is audible with or without the app's media policy and does not prove it.
- Playback started with no user activation at all: the page reloaded on its saved queue, where a page timer (waiting
  out the few seconds script the app ran still counts as a gesture) presses play, `navigator.userActivation.isActive` is false at that moment, and it is audible. Setting
  `mediaTypesRequiringUserActionForPlayback` to `.all` makes this test fail. `hasBeenActive` is already true in a page
  the app loads itself (observed, not explained), so only the transient activation is asserted.
- The app's commands (`toggle`, `next`, `seek`) moving the page.

The harness makes no sound. Each test web view is muted at the page (`Silence.mute`, WebKit's `_setPageMuted:`, checked by
reading the state back and stopping the run if WebKit refuses), below Web Audio: the context runs and the tap's analyser
still sees the 440 Hz tone, but the web process hands the device zeros. After every audible check the harness measures
the loudest sample the page's GPU process sends the device (a Core Audio process tap, macOS 14.2+) and fails above zero;
`SpeakerMeterTests` shows that meter hears a -70 dB tone from a page that is not muted, so its zero means silence. Where
the process tap can't be made (no permission) or `CI` is set (the tap asks for permission, which blocks a runner) the measurement is skipped with a trace line and
only the mute readback stands. Playwright's WebKit has no `sinkId` support, so `test/output-tap.js` routes every sink but
`real` to a zero gain instead of the device.

A Mac with no audio output device never starts an AudioContext: locally the sound checks are skipped with a message, in
CI (`CI` set) they fail. Each run wipes the test web view's website data first. `LODESONG_HARNESS_PORT` pins the app
port (the mock takes the next 19, default: free ports), `LODESONG_HARNESS_LOG` copies the harness trace to a file.
