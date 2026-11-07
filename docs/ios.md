# lodesong on iPhone

The player in its own app: your own icon, no browser bars, and music that keeps playing with the screen locked or the
silent switch on. It's the same page the browser shows (the layout is already made for a phone), wrapped in
`apps/ios`, like the [Mac app](../apps/macos/README.md).

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

1. On first launch it asks where your lodesong is: `https://music.example.com`, or an IP and port on your home
   network (`192.168.1.20:8080`). Away from home it needs a route to the server: your tunnel, or Tailscale on the phone.
2. Sign in with your Navidrome account, as in the browser. The sign-in is kept in the app.
3. **Four quick taps** on the sign-in page's background open a small menu: reload, or change server. If the server
   can't be reached, the app says so and offers the same.

## What to check on your phone

This version was written and compiled without a phone in reach. The full step-by-step list, with what should happen
and where to look when it doesn't, is [the device checklist](ios-device-checklist.md). The short version, in order:
silent switch, screen lock, lock screen controls, AirPods, a call or alarm, then Wi-Fi off. The first three are where
WebKit in a web view is most likely to behave differently from Safari.

## How it works

- `PlayerController` owns the web view and reports to the same bridge the Mac app uses
  (`webkit.messageHandlers.keep`): it takes the audio session when a song starts playing.
- The audio session category is *playback*, which is what ignores the silent switch and allows background audio
  (`UIBackgroundModes: audio`).
- After a call or alarm the app takes the audio session back and resumes if music was playing.
- The lock screen controls come from WebKit's media session, from the page's own `navigator.mediaSession`, the same as
  in Safari and in the Mac app.
- `NSAllowsArbitraryLoadsInWebContent` and local networking are allowed, so a server at `http://192.168…` works.

## Later

A native Now Playing and remote-command layer, offline downloads and a share extension if the web view's lock screen
turns out to be flaky. See [the mobile app notes](design/mobile-app.md).
