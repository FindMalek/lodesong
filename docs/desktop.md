# lodesong on Linux and Windows

Two ways to get the player in its own window, from least to most effort. The Mac has its own app:
[apps/macos](../apps/macos/README.md).

## 1. Install it as an app from the browser (works today)

lodesong is an installable web app, so Chrome, Chromium, Edge and Brave can give it a window, a Start menu or launcher
entry and an icon, with no download:

1. Open your lodesong in the browser and sign in.
2. Click the install icon at the right end of the address bar (or menu → *Install lodesong* / *Cast, save and share →
   Install page as app*).
3. It opens in its own window without browser bars. Media keys and the system now-playing controls work the way they do
   in that browser.

Firefox on desktop has no install option for web apps; use the app below, or keep a tab.

## 2. The desktop app (Tauri)

`apps/desktop` is a small [Tauri](https://tauri.app) shell: a window on the system webview (WebView2 on Windows,
WebKitGTK on Linux) that opens your lodesong. Installers are about 5 MB, not the 100 MB a bundled Chromium would be.

Each release has, built by the [Desktop workflow](../.github/workflows/desktop.yml):

| file | for |
|---|---|
| `lodesong-linux.deb` | Debian, Ubuntu and friends: `sudo apt install ./lodesong-linux.deb` |
| `lodesong-linux.AppImage` | any distro: `chmod +x` it and run it |
| `lodesong-windows.msi` | Windows installer |
| `lodesong-windows-setup.exe` | Windows installer (NSIS), per user |

The installers are not signed. Windows SmartScreen warns on first run: *More info* → *Run anyway*.

On first launch it asks where your lodesong is (`https://music.example.com`, or an IP and port on your home network).
The address is kept in the app's config folder, and your sign-in is kept by the web view between launches. The
**lodesong** menu has *Reload* and *Change server*.

### Build it yourself

You need [Rust](https://rustup.rs), Node, and on Linux the [Tauri system libraries](https://tauri.app/start/prerequisites/#linux):

```sh
cd apps/desktop
npx @tauri-apps/cli@2 build
```

### What it does not do yet

This is the first step of [#309](https://github.com/FindMalek/lodesong/issues/309): the window and the first-run page.
It was written and compiled in CI without a Linux or Windows machine in reach, so it has not been seen running. Not
built yet:

- the bridge in `apps/player/src/lib/native.ts` (the page talks to the Mac app through it), so no mini player and no
  native now-playing; the web view's own media session is what the system sees (MPRIS on WebKitGTK, SMTC on WebView2),
  which needs checking
- a tray icon and "closing keeps the music going"
- in-app updates: download the next release's installer
- links to other sites open inside the window instead of the browser
- whether Web Audio (analyser, EQ, gapless) behaves on WebKitGTK, the open question in
  [the plan](design/desktop-linux-windows.md)

Until those exist the browser install above is the better desktop experience.
