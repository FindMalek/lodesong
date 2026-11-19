# Roadmap

The plan for making lodesong the best self-hosted music player. Every item is a GitHub issue; epics hold
sub-issues. Run [`scripts/setup-project.sh`](../scripts/setup-project.sh) once to put them all on a GitHub Project
board with a `Phase` and `Priority` field.

**Where it stands (1.20, Nov 2026):** the web player, the Mac app, the iPhone and Android shells, a Linux and Windows
shell, the following page, inferred genres, previews, the public demo, the launch film and the API are in. v1 is done
as a product; what is left is *getting music you do not own yet* and a native iPhone app. Candidate search, fetch the rest of an album,
Release Radar from followed artists, playlist cover choices, the queue drag test, the instant pause, clickable release
cards, a faster Made for you and the phone touch targets have shipped; the rows below mark what is still open.

**Shipped, no longer open work:** the iPhone device checklist ([#410](https://github.com/FindMalek/lodesong/issues/410)), Android shell ([#411](https://github.com/FindMalek/lodesong/issues/411)), AltStore source
([#412](https://github.com/FindMalek/lodesong/issues/412)), WebKit and phone e2e ([#413](https://github.com/FindMalek/lodesong/issues/413)), public demo ([#416](https://github.com/FindMalek/lodesong/issues/416)), mobile budgets in CI ([#417](https://github.com/FindMalek/lodesong/issues/417)), screen-reader pass
([#418](https://github.com/FindMalek/lodesong/issues/418)), Last.fm and ListenBrainz with i18n groundwork ([#420](https://github.com/FindMalek/lodesong/issues/420)), Linux and Windows app ([#309](https://github.com/FindMalek/lodesong/issues/309)), music import
with AI metadata ([#183](https://github.com/FindMalek/lodesong/issues/183)), following every Spotify artist through Lyterion ([#435](https://github.com/FindMalek/lodesong/issues/435)), backfilled genres
([#437](https://github.com/FindMalek/lodesong/issues/437)). All closed as completed with a merged pull request. [#319](https://github.com/FindMalek/lodesong/issues/319) (mobile app) closed as done; its leftover,
native Now Playing, lives on as [#512](https://github.com/FindMalek/lodesong/issues/512).

## Versions

release-please decides the number from commit types: `fix` is a patch, `feat` a minor, `feat!` a major.

- **1.x** keeps shipping everything that does not break a self-hoster: new pages, fixes, Lyterion-backed features.
- **2.0** is cut when one of these lands: the native iPhone app with offline downloads (the headline), or a change
  that forces action on a running install (config, data, or the Lyterion contract).

## 1.x: next, in order

### Get the music (the most wanted)

One pipeline, **play now, keep it**: resolve a track from a source, stream it through the player, and let Lyterion
download and place it in the background; when the file lands the track swaps to the local copy. Fetch is the same
pipeline without the play. Design notes: [music import](design/music-import.md), [discovery status](design/discovery-status.md).

| | what | pri | size | status |
|---|---|---|---|---|
| [#578](https://github.com/FindMalek/lodesong/issues/578) | **search with candidates**: a typed name returns 5 to 8 matches (Deezer, SoundCloud, YouTube) to pick from, not one guess | P0 | M | shipped ([#595](https://github.com/FindMalek/lodesong/pull/595), [lyterion#197](https://github.com/FindMalek/lyterion/pull/197)) |
| [#579](https://github.com/FindMalek/lodesong/issues/579) | **missing-tracks strip** on album and artist pages: "own 2 of 10", greyed missing rows, **Fetch rest** and **Play from web** | P1 | L | Fetch rest shipped ([#596](https://github.com/FindMalek/lodesong/pull/596)); Play from web todo (under [#581](https://github.com/FindMalek/lodesong/issues/581)) |
| [#580](https://github.com/FindMalek/lodesong/issues/580) | **artist Discover tab**: full discography (MusicBrainz or Deezer), each release in library, partial or missing, Fetch or Play on every row | P1 | L | todo |
| [#582](https://github.com/FindMalek/lodesong/issues/582) | **batch add**: queue many songs at once. Lyterion refuses a wish while a run is live, so adds go one by one | P1 | M | todo |
| [#583](https://github.com/FindMalek/lodesong/issues/583) | **new releases from followed artists go into the Release Radar**; remove the "get it" cards | P1 | M | shipped ([#597](https://github.com/FindMalek/lodesong/pull/597)) |
| [#581](https://github.com/FindMalek/lodesong/issues/581) | start streaming while it downloads, then swap to the file without a gap | P1 | L | todo |

### Playback and polish

| | what | pri | size | status |
|---|---|---|---|---|
| [#590](https://github.com/FindMalek/lodesong/issues/590) | pause silences at once (master gain ramp) and the button updates before the event; confirm on the Mac app | P0 | S | pause ramp shipped ([#600](https://github.com/FindMalek/lodesong/pull/600)), Mac app check todo |
| [#589](https://github.com/FindMalek/lodesong/issues/589) | crossfade: say what it does, then a smarter fade that spares an ending that already fades out | P1 | M | text shipped ([#600](https://github.com/FindMalek/lodesong/pull/600)), smart fade todo |
| [#586](https://github.com/FindMalek/lodesong/issues/586) | drag and drop: queue, playlists into folders, tracks inside a playlist | P1 | L | queue test shipped ([#599](https://github.com/FindMalek/lodesong/pull/599)), touch reorder and the rest todo |
| [#584](https://github.com/FindMalek/lodesong/issues/584) | playlist covers: a picture at creation, the dither otherwise, removing the cover goes back to the mosaic; showing them outside the playlist page (search palette) todo | P2 | S | shipped ([#598](https://github.com/FindMalek/lodesong/pull/598)) |
| [#585](https://github.com/FindMalek/lodesong/issues/585) | dither that says something: speed, pixel size and density driven by the playlist's mood and energy; a larger blurred copy as the playlist background | P2 | M | todo |
| [#587](https://github.com/FindMalek/lodesong/issues/587) | playlist tags under the title, not next to the sort buttons | P2 | S | todo |
| [#588](https://github.com/FindMalek/lodesong/issues/588) | inferred genre: fix the "inferred, no genre tag, by artists in this genre" copy and logic | P2 | S | todo |
| [#602](https://github.com/FindMalek/lodesong/issues/602) | home: release cards you can click, past week only, shelf at the bottom | P1 | S | shipped ([#620](https://github.com/FindMalek/lodesong/pull/620)) |
| [#603](https://github.com/FindMalek/lodesong/issues/603) | Made for you: daily mixes first, no pop in | P1 | S | shipped ([#625](https://github.com/FindMalek/lodesong/pull/625)) |
| [#606](https://github.com/FindMalek/lodesong/issues/606) | same artist written two ways (SHYLER vs Shyler) merged on the lodesong side; track rows and the lyterion tag fix todo | P1 | S | shipped ([#622](https://github.com/FindMalek/lodesong/pull/622)), rest todo |
| [#609](https://github.com/FindMalek/lodesong/issues/609) | tap targets of 44px across the phone ui | P1 | S | shipped ([#623](https://github.com/FindMalek/lodesong/pull/623)) |
| [#610](https://github.com/FindMalek/lodesong/issues/610) | visible row actions on touch screens | P1 | S | shipped ([#623](https://github.com/FindMalek/lodesong/pull/623)) |
| [#632](https://github.com/FindMalek/lodesong/issues/632) | player bar: remove the 'playing on chrome on mac' text | P2 | S | in review ([#635](https://github.com/FindMalek/lodesong/pull/635)) |
| [#633](https://github.com/FindMalek/lodesong/issues/633) | player bar: remove the file format (FLAC, MP3...) from the bottom bar | P2 | S | in review ([#635](https://github.com/FindMalek/lodesong/pull/635)) |
| [#604](https://github.com/FindMalek/lodesong/issues/604) | loading play icon, skeletons and page placeholders | P1 | M | todo |
| [#608](https://github.com/FindMalek/lodesong/issues/608) | library-wide check: every page has a skeleton, empty state and error state | P1 | M | todo |
| [#607](https://github.com/FindMalek/lodesong/issues/607) | refetch cover action for albums and artists | P1 | S | todo |
| [#611](https://github.com/FindMalek/lodesong/issues/611) | track list time column leaves a dead strip on the right | P2 | S | todo |
| [#612](https://github.com/FindMalek/lodesong/issues/612) | phone player bar: seek bar and times collide with the cover | P1 | S | todo |
| [#613](https://github.com/FindMalek/lodesong/issues/613) | artists A-Z rail is cut off and too small on phone | P2 | S | todo |
| [#614](https://github.com/FindMalek/lodesong/issues/614) | settings on phone: tab row cut off, tiny slider and toggles | P1 | S | todo |
| [#615](https://github.com/FindMalek/lodesong/issues/615) | playlist header: too many competing actions, delete next to a toggle | P2 | S | todo |
| [#616](https://github.com/FindMalek/lodesong/issues/616) | queue panel: misaligned times, hidden row controls, bare clear | P2 | S | todo |
| [#617](https://github.com/FindMalek/lodesong/issues/617) | following: names are not links, unexplained badge, misclick risk | P2 | S | todo |
| [#618](https://github.com/FindMalek/lodesong/issues/618) | listen together: misaligned join row, unclear toggles and jargon | P2 | S | todo |
| [#619](https://github.com/FindMalek/lodesong/issues/619) | search palette empty state: no recents, two search fields on results | P2 | S | todo |
| [#621](https://github.com/FindMalek/lodesong/issues/621) | home and stats nits: jargon, missing border, truncated text, sparse chart | P2 | S | todo |
| [#605](https://github.com/FindMalek/lodesong/issues/605) | theme: import a shadcn preset code | P2 | M | todo |
| [#628](https://github.com/FindMalek/lodesong/issues/628) | command palette (cmd+k) best practices: prefetch, live data, contextual, blur | P2 | M | todo |
| [#629](https://github.com/FindMalek/lodesong/issues/629) | mobile gestures: no react renders while dragging, transform and opacity only | P2 | M | todo |
| [#630](https://github.com/FindMalek/lodesong/issues/630) | predictive preloading: pointer velocity predicts the click, preload the route first | P2 | M | todo |
| [#631](https://github.com/FindMalek/lodesong/issues/631) | remote volume control: change the volume of the device that is playing | P2 | M | todo |
| [#626](https://github.com/FindMalek/lodesong/issues/626) | trackpad haptics for reordering and other drag interactions | P3 | S | todo |
| [#627](https://github.com/FindMalek/lodesong/issues/627) | pre-commit hooks with lefthook: format, oxlint, react doctor | P3 | S | todo |
| | Daily Mix cover: the dither plus four album images inside the playlist | P2 | S | todo, no issue yet |
| | `browse.e2e.ts` fails on WebKit (the genre filter never shows "N of M") | P1 | S | todo, no issue yet |
| | settings search, a "what's new" in the web app, visual regression, gapless verified per format | P2 | M | todo, no issue yet |
| | cover art on release cards (Cover Art Archive) | P2 | S | todo, no issue yet |

### The Mac app on a managed machine

| | what | pri | size | status |
|---|---|---|---|---|
| [#591](https://github.com/FindMalek/lodesong/issues/591) | the build is ad-hoc signed and not notarized. Without a paid Apple account a download is quarantined; an admin-managed Mac may block it. Ship a user-folder install (`~/Applications`) that works without admin and document clearing quarantine | P1 | S | todo |

## 2.0: the native iPhone app

Looks like Arpeggi and Apple Music. Streaming works through the same "play now, keep it" server path. The iPhone shell
and its device checklist already shipped (see above), so 2.0 is gated on the rows below.

| | what | pri | size |
|---|---|---|---|
| [#592](https://github.com/FindMalek/lodesong/issues/592) | themes: Apple, Monochrome (ours) | P1 | M |
| [#593](https://github.com/FindMalek/lodesong/issues/593) | offline: native file storage, a per-playlist "downloaded" switch | P1 | L |
| [#593](https://github.com/FindMalek/lodesong/issues/593) | download queue: new tracks in a downloaded playlist download on Wi-Fi only, with a quality choice like Spotify | P1 | L |
| [#593](https://github.com/FindMalek/lodesong/issues/593) | storage manager: size per playlist, remove downloads | P2 | M |
| [#512](https://github.com/FindMalek/lodesong/issues/512) | native Now Playing and remote commands, only if WebKit's lock screen proves flaky | P3 | M |

## Later

Still wanted, not scheduled:

- the hosted lodesong ([#320](https://github.com/FindMalek/lodesong/issues/320), [design](design/hosted.md)), use the player against your own Navidrome with no install
- turn on the dependency graph setting and bring the dependency review job back
- French strings native read
- i18n for the remaining pages (follow-up to [#420](https://github.com/FindMalek/lodesong/issues/420)) and lazy-loading player-bar menus (follow-up to [#417](https://github.com/FindMalek/lodesong/issues/417))
- widgets, CarPlay and Android Auto (native code, a paid developer account on iOS)
- comparison pages for search, client error reports, offline downloads in the web shells, a docs version switcher
- GitHub App reinstall note and the dev CSP hash

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
