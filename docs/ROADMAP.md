# Roadmap

The plan for making lodesong the best self-hosted music player. Every item is a GitHub issue; epics hold
sub-issues. Run [`scripts/setup-project.sh`](../scripts/setup-project.sh) once to put them all on a GitHub Project
board with a `Phase` and `Priority` field.

**Where it stands (3 Nov 2026, 1.13):** the web player, the Mac app, the iPhone shell, an Android shell, a Linux and
Windows shell, previews, the landing page and the API are in. This round shipped: start radio as a page, a following
page with a releases feed (grouped by week, filtered by type, mark seen), the Spotify follow sync through Lyterion,
an inferred-genres fallback, AI-filled upload tags, stats without recharts (111 KB to 4 KB gzip), phone polish, a
security pass (CodeQL, audit, CSP reports), mobile performance budgets, a screen-reader-ready a11y suite, scrobbling
state in settings, the i18n groundwork and the repo side of a public demo.

**What the rest needs.** Nearly everything left is not code: it needs a real device, a server only the owner can set
up, or a change in Lyterion. They are listed that way below, so nothing looks done that has not been tried.

## What is left

Priorities: **P0** blocks people or hides a bug class, **P1** the next thing worth doing, **P2** good and not urgent,
**P3** ideas. Sizes: S under a day, M a few days, L a week or more.

### Needs a device

| | what | pri | size |
|---|---|---|---|
| [#410](https://github.com/FindMalek/lodesong/issues/410) | run [the iPhone checklist](ios-device-checklist.md) on a real phone (silent switch, lock screen, AirPods, interruptions) | P0 | M |
| [#412](https://github.com/FindMalek/lodesong/issues/412) | install the AltStore / SideStore source on a phone and see an update arrive | P1 | S |
| [#411](https://github.com/FindMalek/lodesong/issues/411) | Android: screen-off playback, lock-screen controls, Bluetooth buttons, battery optimisation ([checklist](android.md)) | P1 | M |
| [#309](https://github.com/FindMalek/lodesong/issues/309) | Linux and Windows: audio on WebKitGTK, a tray, close to tray, an updater, signing (the Tauri shell is minimal) | P2 | L |
| [#418](https://github.com/FindMalek/lodesong/issues/418) | the VoiceOver and NVDA pass ([checklist](accessibility.md)); axe already covers every page | P1 | M |
| [#319](https://github.com/FindMalek/lodesong/issues/319) | native Now Playing and remote commands in the iPhone shell, only if WebKit's lock screen proves flaky | P3 | M |

### Needs the owner

| | what | pri | size |
|---|---|---|---|
| [#416](https://github.com/FindMalek/lodesong/issues/416) | host the public demo: a public host and DNS, `PUBLIC_DEMO_HOST`, `DEMO_URL` on Vercel ([steps](public-demo.md)) | P1 | S |
| | turn on the Dependency graph in the repo settings, then bring the dependency review job back | P1 | S |
| | the French strings of the i18n groundwork need a native read | P2 | S |
| [#413](https://github.com/FindMalek/lodesong/issues/413) | WebKit and phone e2e projects: merge needs a token with the `workflow` scope | P0 | S |

### Needs Lyterion

| | what | pri | size |
|---|---|---|---|
| [#435](https://github.com/FindMalek/lodesong/issues/435) | the followed-artists endpoint ([lyterion#192](https://github.com/FindMalek/lyterion/issues/192)); lodesong's side is done and retries until it exists | P1 | M |
| [#437](https://github.com/FindMalek/lodesong/issues/437) | backfill `GENRE` on files Lyterion did not write; lodesong shows an honest state and inferred genres meanwhile | P1 | M |
| [#183](https://github.com/FindMalek/lodesong/issues/183) | finding and fetching missing artists belongs to Lyterion; lodesong fills tags into a sidecar, writing them into the files needs a tag writer | P3 | L |

### Code, next

| | what | pri | size |
|---|---|---|---|
| | `browse.e2e.ts` fails on WebKit (the genre filter never shows "N of M"): probably a real Safari bug | P1 | S |
| | cover art on the release cards (a Cover Art Archive proxy) instead of the generated tile | P2 | M |
| [#420](https://github.com/FindMalek/lodesong/issues/420) | convert the other pages to `t()` (history is the template); Last.fm and ListenBrainz connection state | P2 | M |
| [#417](https://github.com/FindMalek/lodesong/issues/417) | lazy-load the player-bar menus, AVIF covers, a gate that compares with the last release | P2 | M |
| | settings search: a filter box in the dialog now that it has nine tabs | P2 | S |
| | a "what's new" in the web app, as the Mac app has | P2 | S |
| | gapless and crossfade verified per format with an automated listening test | P2 | M |
| | drag a playlist track to reorder on touch screens | P2 | M |
| | visual regression for the key pages in dark, light and phone | P2 | M |
| | offline downloads inside the shells (iOS evicts web storage; native files don't) | P2 | L |
| | client error reports, opt in, into the server's log | P3 | S |
| | Widgets, CarPlay and Android Auto: need native code and, on iOS, a paid developer account | P3 | L |

### The site and the community

| | what | pri | size |
|---|---|---|---|
| | the promo video (`apps/video`) on the landing page, with captions | P2 | S |
| | comparison and "migrate from Spotify" pages for search, with real screenshots | P2 | M |
| | a docs version switcher | P3 | S |
| [#320](https://github.com/FindMalek/lodesong/issues/320) | a hosted lodesong against your own Navidrome ([design](design/hosted.md)) | P3 | L |

## Next version

This is a **2.0**, not 1.x: the apps and the release feed change what lodesong is. 2.0 ships when the three device
rows (iPhone, Android, screen reader) have been run and the demo is public. Everything under "Code, next" can land in
1.x releases meanwhile.

### Housekeeping that bit this time

- Install the Claude GitHub App on the renamed repository (the repo moved from `keep-player` to `lodesong`; the app's
  events stopped reaching sessions that still use the old name).
- `docs/` was written before the rebrand in places: the QA pass found the old CSRF header name in
  `docs/security.md` (fixed). A link and name check on the docs, run in CI, would catch the rest.
- Local development: the dev bundler's inline script trips the CSP in the console (production is clean), which hides
  real errors. Give the dev server a matching hash.

## Principles

- **shadcn ecosystem only.** UI is shadcn/ui (Base UI) + Tailwind v4 + the [`@audiocn`](https://github.com/audiocn/ui)
  registry. No hand-rolled components where one exists, no Tailwind palette colors. The brand (monochrome, square,
  IBM Plex + JetBrains Mono, color only for errors) lives only in the shadcn theme tokens.
- **Instant.** Persisted cache, prefetch on intent, virtualized lists, selector-based player state, precached audio.
- **Keyboard first, never memorized.** One shortcut registry drives the shortcuts, the `?` cheat sheet, the command
  palette and every tooltip.
- **Navidrome is the source of truth.** Sync with Arpeggi and other clients uses standard (Open)Subsonic APIs only.
- **Self-hostable by anyone.** One container, one env var to start, guided onboarding, safe defaults.

## Epics

| # | epic | priority |
|---|---|---|
| [#1](https://github.com/FindMalek/lodesong/issues/1) | Foundation: shadcn + Tailwind v4 + audiocn | p0 |
| [#2](https://github.com/FindMalek/lodesong/issues/2) | Performance | p0 |
| [#3](https://github.com/FindMalek/lodesong/issues/3) | Playback engine: gapless, precaching, crossfade | p0 |
| [#4](https://github.com/FindMalek/lodesong/issues/4) | Keyboard-first | p0 |
| [#30](https://github.com/FindMalek/lodesong/issues/30) | Search: fuzzy, typo-tolerant, lyrics | p0 |
| [#5](https://github.com/FindMalek/lodesong/issues/5) | Lyrics everywhere | p0 |
| [#6](https://github.com/FindMalek/lodesong/issues/6) | UX polish: loading, tooltips, motion, states | p1 |
| [#7](https://github.com/FindMalek/lodesong/issues/7) | Cross-device sync with Arpeggi | p1 |
| [#8](https://github.com/FindMalek/lodesong/issues/8) | Library & playlists | p1 |
| [#9](https://github.com/FindMalek/lodesong/issues/9) | Self-hosting: onboarding, security, docs | p1 |
| [#60](https://github.com/FindMalek/lodesong/issues/60) | Signature features other players miss | p1 |
| [#10](https://github.com/FindMalek/lodesong/issues/10) | Discovery, AI playlists & aura | p2 |

## Build order

Phases are ordered by dependency, not just importance: later work assumes the earlier foundations.

1. **Foundation & speed**: the shadcn rebuild, tooling, player store, virtualization, data layer, covers, sessions
   (credential-free URLs make covers and audio cacheable).
   #11 #12 #13 #14 #15 #16 #17 #18 #19 #20 #54
2. **Playback & keyboard**: gapless, precache, resilience, the queue model, the shortcut registry and cheat sheet,
   list navigation, a11y.
   #21 #22 #25 #47 #26 #27 #28 #29
3. **Lyrics & search**: lyrics service and UI, the server index, lyrics search, search UX.
   #34 #35 #31 #32 #33
4. **Polish & sync**: tooltips, skeletons, motion, states, now-playing views, queue hand-off, likes, history,
   context menus, playlist editing.
   #37 #38 #39 #40 #41 #42 #43 #44 #45 #46
5. **v1.0 public release**: onboarding, distribution, docs, settings/PWA, lyrics coverage, Spotify import, library
   browsing.
   #50 #51 #52 #53 #36 #48 #49
6. **Beyond**: crossfade, audio quality, radio, AudioMuse, Groq mixes, aura, stats, moments, trims, undo, library
   doctor, listen together.
   #23 #24 #55 #56 #57 #58 #59 #61 #62 #63 #64 #65

## Decisions

| topic | decision |
|---|---|
| aura | strictly monochrome generated textures from audio features; no cover-derived color |
| lyrics files | cached in the app by default; writing `.lrc` sidecars is opt-in (`LYRICS_WRITE_LRC`) |
| Arpeggi sync | `savePlayQueue`/`getPlayQueue` (Arpeggi lists "sync queue across devices"), stars, ratings, playlists |
| crossfade / EQ | gapless always on; crossfade and EQ optional, off by default; no crossfade within an album |
| lyrics search | needs an index: the Bun server keeps SQLite FTS5 (words + trigram) over library and lyrics |
| upstream server | fixed by server config (`NAVIDROME_URL` / allowlist), never chosen by the browser |
| credentials | server-side sessions with an httpOnly cookie; no tokens in browser storage or URLs |
