# lodesong on iPhone

A native SwiftUI app (`apps/ios`, iOS 26 or newer) that talks to your lodesong server: your library stored on the
phone, playback with the screen locked, and playlists you can keep downloaded.

You don't need a paid Apple developer account (the 99 USD a year one) to try it. There are four ways, from least to
most effort:

| | what you need | lasts | background audio |
|---|---|---|---|
| **1. Add to Home Screen** | just Safari | until you remove it | works, with the limits below |
| **2. Sideload the IPA** | a free Apple ID, and a computer once | 7 days, then it refreshes | yes |
| **3. Build it in Xcode** | a Mac, Xcode and a free Apple ID | 7 days, then run it again | yes |
| **4. The simulator** | a Mac with Xcode | forever | no real lock screen |

## 1. Add to Home Screen (no app at all)

Open your lodesong in Safari → Share → **Add to Home Screen**. It opens full screen with its own icon. iOS limits web
apps: the silent switch can mute it, and iOS may stop audio when the screen has been locked for a while. That's what the
app fixes.

## 2. Sideload the prebuilt app (free Apple ID)

Each release has `lodesong-ios.ipa` (also an artifact of the [iOS workflow](../.github/workflows/ios.yml)). It's
unsigned: a sideloading tool signs it with your own free Apple ID.

- **[Sideloadly](https://sideloadly.io)** (Mac or Windows): plug in the phone, drag the IPA in, enter your Apple ID,
  press Start.
- **[AltStore](https://altstore.io)** or **[SideStore](https://sidestore.io)**: install once, then add the IPA under My
  Apps, or better, add the lodesong source (below). They refresh it before the 7 days run out (AltStore while your
  computer is on the same Wi-Fi; SideStore needs no computer after setup).

Then: Settings → General → **VPN & Device Management** → trust your Apple ID. On iOS 16 and later also switch on
Settings → Privacy & Security → **Developer Mode** (it asks to restart).

A free Apple ID allows 3 sideloaded apps at a time, and each one expires after 7 days; opening your sideloading tool
renews it.

### The AltStore / SideStore source (updates itself)

Every release also carries `altstore.json`, a source feed the release workflow generates from the IPA
(`apps/ios/altstore/source.sh`). Add this URL in AltStore (Browse → Sources → **+**) or SideStore (Sources → **+**):

```
https://github.com/FindMalek/lodesong/releases/latest/download/altstore.json
```

lodesong then shows up under the source, installs from there, and each new release appears as an update. The feed
points at that release's `lodesong-ios.ipa`, so it only changes when a release is made. Not yet checked in a real
AltStore: the first release that carries `altstore.json` is the test.

## 3. Build it yourself in Xcode (free Apple ID)

```sh
brew install xcodegen
cd apps/ios && xcodegen generate && open Lodesong.xcodeproj
```

In Xcode: **Lodesong** target → Signing & Capabilities → Team: add your Apple ID (Xcode → Settings → Accounts) and pick
the *Personal Team*. Change the bundle identifier to something unique to you (`com.yourname.lodesong`). Plug in the
phone, choose it as the destination, press Run, then trust the developer on the phone as above. Run it again every 7
days.

## 4. The simulator

Same project, destination *iPhone 16* (or any). Good for checking the layout and the first-run screen. It can't show
the lock screen or the silent switch.

## Using it

1. Sign in with your server's address and your Navidrome account. Away from home the address must be reachable from
   outside: a domain with HTTPS, a tunnel, or Tailscale on the phone.
2. The library syncs when you open the app. Pull down in the library to sync by hand.
3. Download an album or playlist from its page. A downloaded playlist follows its additions, removals and order the
   next time the app syncs.

## What to check on your phone

None of this has run on a real phone yet. [The device checklist](ios-device-checklist.md) lists what to try.

## How it works

- The session is the same cookie sign in the web player uses (`/auth/login`), then Subsonic under `/rest`.
- Screens read from a SQLite database on the phone. A failed sync never empties it.
- Playback uses `AVQueuePlayer`. What streams as is and what the server transcodes: [audio formats](ios-audio.md).
- Downloads use a background `URLSession`; every file is checked before it counts.

## Not there yet

Lyrics and lyric search, offline play counts, settings, adding music by name, CarPlay browsing. See the
[iOS issues](https://github.com/FindMalek/lodesong/issues?q=is%3Aopen+label%3Aios).
