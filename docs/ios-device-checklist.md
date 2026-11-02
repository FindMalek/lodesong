# iPhone app: device checklist

For [#410](https://github.com/FindMalek/lodesong/issues/410). Nothing here can be seen without a phone: CI only proves
the app compiles. Install the latest `lodesong-ios.ipa` ([docs/ios.md](ios.md)), play something from your own library,
and go through it in this order (the first three are where a web view most likely differs from Safari). Fill in the
last column and open one issue per failing row.

Phone: ______  iOS: ______  app version: ______  date: ______

| # | do this | should happen | if it doesn't, look at | pass |
|---|---|---|---|---|
| 1 | Flip the **silent switch** on (orange showing), play a song | you hear it | `AudioSession.prepare` (category `.playback`) in `AppModel.swift` | |
| 2 | Play a song, press the **side button** to lock | music carries on, and on into the next song (let one finish) | `UIBackgroundModes: audio` in `project.yml`; the page's gapless scheduling while backgrounded (JS timers are throttled), see `apps/player/src/lib/audio` | |
| 3 | Wake the **lock screen** while playing | cover, title, artist and a moving scrubber | the page's `navigator.mediaSession` metadata; WebKit may not publish it from a web view, the planned fix is a native Now Playing layer fed by the `keep` bridge | |
| 4 | On the lock screen: pause, play, next, previous, drag the scrubber | each one works and the page follows | same as 3 (remote commands) | |
| 5 | **Control Center**: the same card and buttons | same as 3 and 4 | same as 3 | |
| 6 | **AirPods** (or the car): double tap / press to pause and play, skip | the music follows | same as 4 | |
| 7 | Unplug or switch off the AirPods while playing | music pauses and does not blast from the speaker | iOS does this by itself; note if not | |
| 8 | Get a **call** (or set an alarm for a minute away) while playing, finish it | music pauses, and comes back by itself afterwards | `interruption(_:)` in `PlayerController.swift`, which re-takes the audio session and calls `keepNative.play()` | |
| 9 | Play, open another app (Safari, Maps) for a minute, come back | music never stopped; the page is where you left it | background modes as in 2 | |
| 10 | Play for 10 minutes with the screen locked | no gap, no stall, track changes land on time | gapless scheduling, as in 2 | |
| 11 | Switch off Wi-Fi and mobile data, reopen the app | the "can't reach" screen appears | `fail(_:)` in `PlayerController.swift` | |
| 12 | Switch the network back, press *try again* | the player loads again | `reload()` | |
| 13 | **Four quick taps** on the sign-in page background | the small menu appears (reload, change server) | the `preview` message in `userContentController` | |
| 14 | *Change server*, enter another address | the app loads that one; killing and reopening the app keeps it | `AppModel.server` | |
| 15 | Kill the app, reopen it | still signed in | `websiteDataStore = .default()` | |
| 16 | Rotate the phone | the layout follows, no reload | | |
| 17 | Tap a link to another site | it opens in Safari, not in the app | `decidePolicyFor` in `PlayerController.swift` | |
| 18 | (If you use AltStore) wait 6 days, or add the source and install a newer release | it refreshes, or shows the update ([docs/ios.md](ios.md)) | `altstore.json` on the release | |

## What is already handled in code

- The silent switch (1): the audio session category is `.playback` from launch.
- A call or alarm (8): the app listens for the audio session interruption and resumes when iOS says it should. It only
  resumes if music was playing when the interruption began.

## Reporting a failure

One issue per row: the row number, the phone and iOS version, what you saw instead. If the lock screen controls (3 to
6) are flaky or missing, say so in the issue for the native Now Playing layer rather than patching the page.

## Checked without a phone

- The project generates and compiles for the simulator and for a device in CI ([iOS workflow](../.github/workflows/ios.yml)).
- The simulator can show the first-run screen, the layout and the failure screen (rows 11, 12, 13, 14, 16, 17) but not
  the silent switch, the lock screen or interruptions (1 to 10), so those need the phone.
