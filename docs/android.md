# lodesong on Android

The player in its own app: your own icon, no browser bars, and music that keeps playing with the screen off, with
controls on the lock screen and in the notification. It's the same page the browser shows, wrapped in `apps/android`
(a small Kotlin app around a WebView), like the [iPhone app](ios.md) and the [Mac app](../apps/macos/README.md).

## Install

Android lets you install an APK without a store.

1. On the phone, open the latest [release](https://github.com/FindMalek/lodesong/releases/latest) and download
   `lodesong-android.apk`.
2. Open it. Android asks to allow installs from that browser or file manager: allow it once (Settings → Apps → Special
   app access → Install unknown apps).
3. Open **lodesong**, allow notifications (the lock screen controls are a notification), and type the address of your
   server, like `https://music.example.com`, or an IP and port on your home network (`192.168.1.20:8080`).
4. Sign in with your Navidrome account, as in the browser.

Needs Android 8 or newer. To update, install the next release's APK over it: every release is signed with the same
key, so it installs in place and keeps your sign-in.

The key is committed (`apps/android/lodesong-sideload.p12`, password `lodesong`) and is not a secret: it only keeps the
signature stable between releases. Anyone could sign an APK with it, so install lodesong only from this repo's
releases. To sign with your own key, build it yourself with `LODESONG_KEYSTORE`, `LODESONG_KEYSTORE_PASSWORD` and
`LODESONG_KEY_ALIAS` set.

## Build it yourself

You need JDK 17, the Android SDK and Gradle 8.10:

```sh
cd apps/android
gradle assembleRelease
# apps/android/app/build/outputs/apk/release/app-release.apk
```

The [Android workflow](../.github/workflows/android.yml) does exactly this on every pull request that touches
`apps/android`, and attaches the APK to each release.

## Using it

- **Back** goes back in the page; at the first page it moves the app to the background and keeps the music playing.
- Four quick taps on the sign-in page's background open a small menu: reload, or change server. If the server can't be
  reached the app says so and offers the same.
- Links to other sites open in your browser.

## How it works

- The page already reports what is playing to `webkit.messageHandlers.keep` (what the Mac and iPhone apps listen to).
  The app injects a small script before the page runs that maps that onto a JavaScript interface, so the page needs no
  Android-specific code.
- `PlaybackService` is a foreground service of type *media playback*. It holds a `MediaSession` (title, artist,
  cover, playhead, lock screen and Bluetooth buttons) and a partial wake lock while playing. The buttons call the
  page's own `keepNative` controls (`toggle`, `next`, `previous`, `seek`).
- The WebView is never paused when the app goes to the background, which is what lets the audio, and the web player's
  gapless scheduling, carry on.
- Plain `http://` is allowed, so a server at `http://192.168…` works.

## What to check on a phone

This version was written and compiled in CI without a phone or an emulator, so none of it has been seen running. In
this order:

1. It installs, asks for the address, and loads the sign-in page.
2. Play a song, switch the **screen off**: it should carry on into the next song.
3. The **lock screen and notification**: cover, title, play, pause, next, previous, the scrubber.
4. **Bluetooth headphones** or the car: play and pause from them.
5. A **call or alarm** interrupting, then music again.
6. Switch off Wi-Fi: the failure screen appears, and *try again* recovers when it's back.
7. Battery optimisation: if some phones (Xiaomi, Samsung, OnePlus) stop the music after a while, set the app to
   *Unrestricted* in Settings → Apps → lodesong → Battery.

If something fails, say which step, the phone and the Android version.

## Later

Offline downloads, a share target, and a signed build on Google Play or F-Droid if there is ever a reason for one. See
[the mobile app notes](design/mobile-app.md).
