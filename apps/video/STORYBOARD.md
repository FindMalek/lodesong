# lodesong launch film: director's package (phase 1)

Status: research and direction only. Nothing in the repo or in PR #522's worktree was touched. Read-only copy of the
PR branch (apps/video, scripts/audio) is in `./src/` next to this file, for reference.
Move this file to `apps/video/STORYBOARD.md` when the build starts (the playbook asks for it there).

---------------------------------------------------------------------------------------------------------------------

## 0. What is wrong with the current cut (measured, from frames and numbers)

Current hero (`~/Desktop/lodesong-promo/hero-16x9.mp4`, 30.0 s, 1080p60, -14.0 LUFS), 1 fps frame sheet plus blackdetect:

| finding | evidence |
|---|---|
| Reads as a kinetic-type reel. | 5 of 6 shots are a big lowercase headline (`your music. your server.`, `keyboard first.`, `mixes from what you play.`, `one session. every device.`, `now playing in your terminal.`) over a small panel. A slide deck with motion. |
| Product is small, dim and fake. | The real-looking app is a React recreation (`ui/player-panels.tsx`), full-bleed for ~3 s (6 to 9 s). Everywhere else it is a 20 to 35% opacity backdrop behind a headline, or a 700 px card in a corner. Zero captured product pixels. |
| Dead air. | blackdetect: 0.28 to 0.57 s, 2.98 to 3.18 s, 10.40 to 10.57 s, 27.0 to 27.4 s (the last is intentional). The ~12.5 to 13.3 s dither wipe is nearly black (frame at 13 s: a faint dot field and a grey rectangle). "keyboard first" holds a dimmed app plus a sheet for ~3 s. |
| Flat tempo. | `design/beat.ts`: `BPM = 120`, `beat(n) = round(n * 30)` frames. Cut lengths are 8, 5, 5, 5, 4, 3 s: they shorten, but the score does not follow (fixed 120, Am9/Fmaj7/Cmaj9/G6 loop). No tempo ramp. |
| Making-of furniture. | Crop marks (`PLAYBOOK` section 4: "Crop marks sit 56 px in [built]") and a timecode-style label in the lyrics close-up and the `Probe`/frame chrome. They say "behind the scenes", not "product". |
| Vertical cut is the same problem narrower. | 9:16: line, lyrics on a cover, a small session card, end card. 15 s of mostly black margin. |
| Coverage is thin. | Film mentions: synced lyrics, search, shortcuts, mixes, session, terminal, docker. Not shown at all: play from the line, queue/gapless/crossfade, AI mood playlists, folders, stats/recap, following, share cards, offline, upload/doctor, native shells (Mac notch, iPhone, Android, desktop), themes. |

Verdict: well-typeset and on the grid, but it is a template, not a film. It also has no moment where you think "I want
to use that". The fix is not more motion on the same material; it is **real product, big, with a camera**, cut to an
accelerating score, with type reduced to two moments (open and close) plus tiny product-style labels.

---------------------------------------------------------------------------------------------------------------------

## 1. Research: what we can steal (and an honest note on the references)

The four reference URLs were fetched. Three of them are thin: the music-video skill repo README only names its
toolchain (Core Graphics/Metal, 30 fps preview, 60 fps master, beat/section "timing maps" from audio analysis,
"beat-synced camera moves"); the Remotion skills page is an index of installable skills (`remotion-best-practices`,
`-markup`, `-render`, `-captions`, `-maps`, `-saas`, `-interactivity`, `-docs`); `remotion.dev/prompts` and
`manalkaff/remotion-prompts` are one-line titles. What is useful from them is the shape of good prompts, and these
specific ideas. The rest of the list is the Marcel workflow summarised in the agent brief plus standard film craft.

From the references:
- **Product demo from the real codebase UI** (prompt gallery "Product Demo Video"): confirms the direction: real UI, not drawings.
- **Highlight real text with subtle zoom, blur and 3D rotation** (prompt "News Screenshot Animation", they use OCR): we
  do not need OCR, Playwright gives exact `boundingBox()` for any text we want highlighted. Underline the matched
  `lights on` in the cmd-k result by drawing a stroke along the real box.
- **Camera moves over a map with data overlays** (maps prompts): same grammar as a camera moving over a UI plate with
  overlays that draw on.
- **Transparent CTA overlay**: a lower-third that sits over footage instead of owning the frame.
- **Beat/section timing map drives visuals** (music-video skill): we invert it: cut lengths drive the timing map, the score is generated from it.
- **30 fps previews, 60 fps master**: iterate at `--scale=0.5 --every-nth-frame=2`, master at 1080p60.
- Marcel workflow: layers with per-layer moments, CSS 3D camera, hard cuts, tempo ramp 100 to 138 BPM, motion blur, AAC 320k.

Techniques lodesong's cut does NOT use yet (all feasible in the existing Remotion/Tailwind stack, deterministic):

1. **Captured product plates** (2880x1620 PNG from the real app) on a 3D plane; push-ins on real pixels.
2. **Panel slicing for parallax**: cut one plate into sidebar / main / lyrics / player bar with `clip-path`, give each a
   `translateZ` (0 / 40 / 80 / 120). When the camera yaws 3 to 5 degrees the real UI gets depth with no 3D model.
3. **Target-driven camera**: camera keyframes generated from the capture manifest (element boxes). The camera always
   drifts to the next action's box, ease-in-out, arriving on the beat.
4. **Actor cursor**: a virtual cursor (gold-ringed, 28 px) travels a bezier to each click target, ripples on click.
   Click time = on-screen state change = sound event.
5. **Light pool**: plate rendered at 0.22 brightness; a radial-masked bright copy follows the focus point (cursor, active
   lyric line, caret). The rest falls to black. Replaces the "dim app behind headline" look with "lit app".
6. **Depth of field / rack focus**: blur ramps on layers by `|z - focusZ|`; foreground out-of-focus gold dither dots
   (bokeh in our dither identity) drift across at z = +300; rack from plate to foreground keycap and back.
7. **Motion blur on camera moves** (`@remotion/motion-blur` `CameraMotionBlur`, 6 to 10 samples, 180 degree shutter), only
   on shots where the camera travels fast; plates are stills so it is cheap.
8. **Whip-pan and match cuts**: the gold cover is the match element (same size and position across a cut), whip pans use
   directional blur plus translate, landing on beat. Hard cuts everywhere else; dither wipe only at chapter changes.
9. **Draw-on**: SVG `stroke-dashoffset` (or `@remotion/paths` `evolvePath`) for: the hairline at open, the session
   connection (laptop to phone to Mac to terminal) as a gold line with a travelling pulse, the stats chart, bracket
   outlines around the active control. Labels type with a caret (exists) at >= 28 px.
10. **Word-by-word karaoke fill** on the lyric (gold fill sweeping through the word), matching the app's real enhanced-LRC behaviour.
11. **Time remap on footage**: sequence plates with easing (slow 10k-row scroll that speed-ramps), freeze-frame punches on the beat.
12. **Tempo ramp derived from cut lengths** (section 6): the edit accelerates 100 to 138 BPM; the score and every cut share one map.
13. **Cues generated from the capture manifest**: every keystroke, click, list row, device switch gets a sound at its
    exact frame; no hand-typed frame numbers. Silence of 2 to 3 frames before the drop and before the final hit.
14. **Ritardando at the very end**: last 8 beats leave 138 BPM and settle (hold, chord, grain fades out, last frame sharp).
15. **Halation**: a soft gold bloom (blurred copy, `mix-blend-mode: plus-lighter`, 8% opacity) on the cover and active line. Cheap, reads as light.

Dropped on purpose: chromatic aberration, glitch effects, stock whooshes, any colour besides the gold family (identity:
monochrome plus one accent).

---------------------------------------------------------------------------------------------------------------------

## 2. Inventory of everything user-facing (README, docs/, ROADMAP, e2e, apps/*)

Sources read: `README.md`, `docs/*.md` (27 pages), `docs/ROADMAP.md` (there is no root `ROADMAP.md`), `e2e/*.e2e.ts`
(72 specs by name), `apps/{player,web,macos,ios,android,desktop,api,video}`, `integrations/{claude-code,opencode}`,
`docs/macos/*.png`, `scripts/hero/*`.

Ranked by visual wow (A = must be on screen for real, B = shown briefly, C = one-frame flash or caption chip):

| # | feature | rank | why it films | source |
|---|---|---|---|---|
| 1 | Synced lyrics, full screen, line by line and word by word, `[` `]` nudge, click a line to play from there | A | the signature image; big type that moves with the music | lyrics.md, lyrics.e2e |
| 2 | Search by a half-remembered lyric, plays from that line; typo tolerant; `artist:` `year:1990..1999` `is:liked` `format:flac` | A | typing into cmd-k and the result underlining is pure cinema | search.md, search.e2e |
| 3 | One session across devices (device picker, play here control there), handoff | A | the "Connect" moment: a line connects two screens | devices.md, sync.md, queue-sync.e2e |
| 4 | Daily mixes, discover weekly, daylist, dithered mix covers (monochrome aura from audio features) | A | the dither mosaic, brand identity | mixes.md, mixes.e2e |
| 5 | Playlist from a prompt ("late night drive, 90s, no vocals"), mood search ("gym") | A | typing a sentence, a mix appears | ai-playlist.e2e, search.e2e |
| 6 | A queue you can see (separate from the album), balanced shuffle, undo, stop after this, sleep timer | B | drag a row, cmd-z | queue.e2e, undo.e2e |
| 7 | Gapless two-deck, crossfade, ReplayGain, 10-band EQ, stream quality (auto/original/mp3 320/Opus) | B | crossfade = two covers dissolving; EQ = ten bars | crossfade.e2e, gapless.e2e, audio-quality.e2e |
| 8 | Keyboard first: `?` cheat sheet, every shortcut rebindable, `g h` style chords, `b` save a moment, `⇧C` copy link to this point | A | keycaps hard-cut montage on the accelerating beat | shortcuts.md, every-shortcut.e2e, moments.e2e |
| 9 | Native shells: Mac app with the song around the notch (compact/open/peek), iPhone, Android, Linux/Windows (Tauri) | A | the notch island is the best "wow" outside the browser | macos/README, ios.md, android.md, desktop.md, docs/macos/*.png |
| 10 | Now playing in the terminal: Claude Code and OpenCode (song, lyric line, transport above the prompt) | A | typed `/lodesong pause`, controls react | integrations/*, README |
| 11 | Offline: next songs precached by service worker, plays and seeks offline; PWA install | B | airplane-mode glyph, song keeps going | offline.e2e, cache.e2e |
| 12 | Recap, stats (minutes, streaks, listening clock), history, forgotten favourites, radio that learns skips | B | the stats page draws on beautifully | stats.e2e, history.e2e, radio.e2e |
| 13 | Following + new-releases feed grouped by week; Spotify follows via Lyterion | B | releases.e2e, follow-sync.e2e | mixes.md, lyterion.md |
| 14 | Playlist folders (nest 4 deep, drag in, aura or own picture) | B | drag and drop, dithered aura folders | playlist-folders.e2e |
| 15 | Share cards / Open Graph: link unfurls with the real album, song, playlist, artist art; copy share link; stop sharing | B | the OG tiles are real 1200x630 art | share.e2e, og-*.jpg |
| 16 | Listen together (host, party mode) | B | two cursors on one song | listen.e2e, listen-together.md |
| 17 | Upload songs/folders into the tagging inbox; library doctor (missing covers/tags/ReplayGain, duplicates, low quality) with one-click fix via Lyterion | B | checklist ticking | upload.e2e, doctor.e2e |
| 18 | Themes (presets preview instantly, light mode), dithered visuals in app and OG, colour only for errors | B | light-mode flash is a strong single-frame contrast | theme.e2e, aura.e2e |
| 19 | Speed: 10k-song list renders ~40 rows, library cached so reload paints instantly, first screen < 161 KB JS gzip | B | fast scroll through 10k rows | virtual.e2e, README |
| 20 | Accessibility (axe on every page, screen-reader ready), i18n groundwork (French history), 320 px layouts | C | caption chip + one frame | a11y.e2e, i18n.e2e, responsive.e2e |
| 21 | Scrobbling through Navidrome (Last.fm, ListenBrainz) | C | caption chip | README |
| 22 | Subsonic compat: Arpeggi, Substreamer, Symfonium, same account | C | chips on the handoff shot | sync.md |
| 23 | Self-hosting: `docker run`, compose, from source (one executable), guided setup, coding-agent prompt, privacy (never touches files; sessions httpOnly; CSP) | A | the typed `docker run` is the finale payoff | self-hosting.md, security.md |
| 24 | Public demo (`demo`/`demo`, 10k generated songs) | C | end-card line | public-demo.md |
| 25 | Moments (bookmark with a note, highlight reel) | C | tick on the seek bar in the keyboard storm | moments.e2e |
| 26 | Previews, mini player on top (Chromium PiP), output device picker | C | chip | previews.md, README table |

Roadmap items (not features, never shown as available): iOS/Android device passes, Windows/Linux polish, hosted version, CarPlay/Widgets. The film must not imply them.

---------------------------------------------------------------------------------------------------------------------

## 3. Concept

**Thesis.** Your music files, your server, and a player as good as the streaming apps, better where they cut corners.
The film is not a feature list; it follows **one song and one lyric line** ("i keep the lights on") from a half-
remembered search, through every surface it can live on, to the command that gives you all of it.

**Tagline.** `your music. your server.` (kept; already in README and the first film). Optional second line on the end
card only: `played like a streaming app.`

**Through-line (the gold thread).** The cover of `signal violet pt. 2` is monochrome dither until the lyric is
found; the moment you play from that line it ignites gold (#d4a24c family, `--ignite`). From there a gold thread
(cover, gold seek bar, gold active lyric, gold connection line) is the only colour in the frame and is the match
element across every cut. It ends as the logo's accent.

**Rules for this edit.**
- Product at least 70% of runtime (real captures plus faithful mocks only where capture is impossible).
- Type: exactly two typographic moments (open line, end line) at display size. Everything else is the product's own
  text, or a tiny mono label in a corner chip at >= 28 px (legibility gate), max 1 per shot, written as product copy
  (a key + what it does, e.g. `⇧F  full screen lyrics`), never a slogan.
- No crop marks, no timecode, no frame chrome. Remove them everywhere (see task T2).
- Hard cuts on beats; dither wipe only at the three chapter changes; the camera is always moving toward the next action.
- No black longer than 6 frames except the intentional breath before the last hit (see S11/S12).
- Accelerating edit: shot lengths follow the tempo ramp (section 6). 138 BPM from shot 10.

---------------------------------------------------------------------------------------------------------------------

## 4. Storyboard (hero, 16:9, 1920x1080, 60 fps, 38.1 s)

Timing comes from section 6: beats and BPM per shot, starts and frame counts below are what the tempo map yields. All
camera numbers are in stage units of the 1440x810 app plate; "push to X" means centre on that element's captured box.

Chapters: **A hook** (S1 to S2), **B listen** (S3 to S5), **C discover** (S6, S7), **D everywhere** (S8, S9),
**E yours** (S10 to S12).

| # | shot | beats @BPM | start s | frames | purpose |
|---|---|---|---|---|---|
| S1 | cold open | 4 @100 | 0.00 | 144 | one gold line, one question |
| S2 | find the line | 8 @104 | 2.40 | 277 | cmd-k, half-remembered lyric |
| S3 | play from the line | 8 @108 | 7.02 | 267 | the ignition |
| S4 | the lyrics, full screen | 8 @112 | 11.46 | 257 | the hero image |
| S5 | the queue, gapless | 4 @116 | 15.75 | 124 | it behaves |
| S6 | mixes | 8 @120 | 17.81 | 240 | made from what you play |
| S7 | ask for a mood | 4 @124 | 21.81 | 116 | a sentence becomes a playlist |
| S8 | one session | 8 @128 | 23.75 | 225 | handoff |
| S9 | everywhere | 8 @132 | 27.50 | 218 | notch, phone, Android, desktop, terminal |
| S10 | keyboard storm | 4 @136 | 31.14 | 106 | hard-cut montage, every beat a key |
| S11 | yours | 4 @138 | 32.90 | 104 | 1-beat flashes: offline, upload, doctor, share, light, speed |
| S12 | land | 8 @138 (ritardando) | 34.64 | 209 | docker run, pull back, wordmark |

(Total 2287 frames, 38.12 s. S12's last 2 beats ritard to ~100 BPM for the final hit; audio handles it, picture holds.)

### S1 cold open (beats 0 to 4, 100 BPM, frames 0 to 143)
- **Image.** Pure void. At beat 0 a hairline (SVG, 1 px, gold 40%) draws left to right across the middle (draw-on, 1.5
  beats). On beat 1 the hairline opens like a lid into a 560x640 dither field that resolves (fine dots to the cover
  pattern, `DitherCover`) into the **monochrome cover**, not gold yet. Beat 2: `your music.` types (mono caret, 28 px
  min, here at display 120 px, the only headline). Beat 3: caret jumps, `your server.` completes dimmer.
- **Camera.** Slow 1.04 to 1.0 push-out on the cover plane; foreground bokeh dots (z +300, blur 14 px) drift left.
- **Cut.** Hard cut on beat 4 straight into the cmd-k palette (S2); the headline's last letter is struck on the cut.
- **Sound.** Beat 0 single tick (hairline), beat 1 bell E5, beat 2 bell A5 (the motif), 2-frame silence before the cut, hit on 4.
- **Fix over current.** 2.4 s, not 6; no black frames; the cover is on screen from beat 1.

### S2 find the line (beats 4 to 12, 104 BPM)
- **Image.** Real captured app, the album page, full-bleed at 1.5x with the light pool on the search field. Virtual cursor
  not used; key actions only. `⌘K` keycaps stamp (28 px legend), palette drops in (real capture). Caret types
  `lights on` one letter per ~3 frames (8 captured stills, real app typo-tolerant results updating). Result rows
  appear: `i keep the lights on  signal violet pt. 2  1:14`, others. A stroke draws under the matched words
  (`boundingBox` of the `<mark>`, draw-on 12 frames). Arrow-down highlights row 1.
- **Camera.** Starts wide at 1.2x, drifts to the palette (push to 1.8x), then micro-tilt toward row 1; rack focus from the keycaps (foreground, z +120, sharp) to the result row (sharp) with the plate defocused 2 px in between.
- **Label chip (bottom left, 28 px mono).** `lyric search  plays from that line`
- **Cut.** Beat 12: `enter` keystroke flashes; hard cut.
- **Sound.** Keycap thock on `⌘K`; one key tick per letter (cue frames generated from the capture manifest); soft
  rising tick sequence on results; a rising riser across the last 2 beats into the drop.
- **Covers.** Search, typo-tolerance, filters (chip `year:1990..1999` flashes in S10), lyrics search.

### S3 play from the line (beats 12 to 20, 108 BPM)
- **Image.** Impact frame: the song starts mid-song at that line. Cover **ignites gold** (dither dots shift to gold in a
  radial wave from the centre over 18 frames), halation blooms, seek bar jumps to the 1:14 position and its fill goes
  gold. The full app (real capture, player bar visible) sits big behind; the lit region follows the gold. Match cut:
  cover in the player bar scales from 48 px to the 560 px S4 cover at the shot end.
- **Camera.** Whip pan from the palette to the player bar (directional blur on beat 12, 6 frames), then a slow
  push from player bar up to the lyrics panel. Motion blur on the whip only.
- **Label.** `starts at the line, not at 0:00`
- **Sound.** The drop: sub-bass hit plus impact plus whoosh on the cut frame, kick enters (beat 12), pad opens, bell on the gold ignite.

### S4 the lyrics, full screen (beats 20 to 28, 112 BPM)
- **Image.** `⇧F`: the real full-screen lyrics view (capture) as the big image: 92 px lines beside the 560 px gold cover.
  Active line brightens, **word-by-word** gold fill sweeps through each word; past lines fade, upcoming lines at 25%.
  On beat 24 `]` is pressed: a `+0.2 s` nudge toast appears (real) and the timing shifts, a caption chip `[  ]  fix the timing per song`.
  Then a click on a future line (cursor actor), playback jumps there (match: seek bar jumps).
- **Camera.** The only calm shot: slow 1.00 to 1.05 push toward the active line with 4 degrees yaw settling to 0; light pool locked to the active line.
- **Sound.** Bed full, arpeggio enters, each line change a soft pluck on the line's start beat (cues from lyric timestamps), nudge click.

### S5 the queue, gapless (beats 28 to 32, 116 BPM)
- **Image.** `q`: queue panel from the real app. A row drags from position 6 to 2 (6 captured stills) and `⌘Z` puts it
  back (undo). Next, a split: two covers (monochrome and gold) crossfade (real crossfade slider capture plus two
  dither covers overlapping, `crossfade 6 s`), then a 10-bar EQ whose bars draw on and sway. A tiny chip `gapless  crossfade  eq  replaygain`.
- **Camera.** 1.5x on the queue, a whip pan to the right half for the EQ on beat 30. 
- **Sound.** Rising 5 ticks as rows reorder; undo = reverse tick; crossfade = filtered swell; the first "full" bass line enters.

### S6 mixes (beats 32 to 40, 120 BPM)
- **Image.** Home, real capture: `made for you` row. Camera dives into the row as the dither mix covers (daily mix 1 to 5,
  discover weekly, daylist; real captured tiles) each resolve from fine dots, left to right, one per beat (beat-
  locked stagger). One tile (`daily mix 1`) rushes forward (3D, z +200) and opens (hard cut to the mix page). The
  sidebar behind shows playlist folders with dithered auras (`late night drive` folder dragging playlists in, 6 stills).
  Chip: `mixes from what you play  saved to navidrome`.
- **Camera.** Starts top-down on the home plate, tilts 8 degrees (rx) into the row, push 1.4 to 2.2x on the covers, light pool follows each tile as it resolves.
- **Sound.** Each cover resolve a soft shimmer pluck on the next chord tone; the opened mix a hit on beat 40.

### S7 ask for a mood (beats 40 to 44, 124 BPM)
- **Image.** AI playlist prompt dialog (real): types `late night drive, 90s, no vocals` (caret), enter, the playlist
  appears with the sidebar entry highlighting; a one-frame flash of the gym mood search in cmd-k (`gym` finds playlists
  and genres, "why" text). Plus the Recap/stats arc: the stats page chart draws on (SVG over the real capture, 14 frames).
  This shot is short on purpose: three beats of typing, one of result.
- **Camera.** Locked at 1.6x with 1.5% hand-held drift; a fast 2.0x snap push on the result.
- **Sound.** Typed ticks (generated), filter sweep opening, a gold "ding" when the list lands.

### S8 one session (beats 44 to 52, 128 BPM)
- **Image.** Two real captures side by side in 3D: the desktop player (browser) and the phone (390x844, real phone
  layout at 3x, iPhone UA) at slight opposing yaw (-12 and +12 degrees), z separated. Cursor clicks `devices` in the
  player bar, the picker (real) lists `chrome on mac`, `safari on iphone`; cursor selects the iPhone. A **gold line
  draws** from desktop to phone along an SVG path, a pulse travels it, playback state moves: desktop shows `playing
  on iphone`, phone's seek bar takes over at the same position (matched numbers). Chips draw on at the line's end: `web  macos  ios  android  desktop  arpeggi`.
- **Camera.** Orbit: yaw sweeps from -10 to +10 degrees over the shot, push 1.1 to 1.5x on the picker, then pull to
  the line. Motion blur on. DOF: the farther device is slightly soft until the pulse reaches it (rack).
- **Sound.** Biggest moment: full drop at beat 44 (the louder of the film), line draw as a rising glissando, pulse = pitched
  tick, arrival = chord bloom. Cues: the clicks from the capture manifest.

### S9 everywhere (beats 52 to 60, 132 BPM): the shells and the terminal
- **Image.** Hard cuts, one per 2 beats, same gold cover as match element:
  1. **Mac notch island** (real `docs/macos/open.png`/`compact.png`/`peek.png`, 1280 px wide: used at <= 1.5x and over a
     generated wallpaper of dithered black so no upscaling artefacts; the island expands from the notch `compact` to `open` to `peek`).
  2. **iPhone lock screen/app** (faithful frame around the real phone capture; label chip `iphone app`).
  3. **Android** frame around the same phone capture, different device bezel (chip `android app`).
  4. **Linux and Windows window** (Tauri shell: the plain app in a plain window, chip `linux  windows`).
  5. **Terminal** (faithful mock, since it cannot be captured): Claude Code with `signal violet pt. 2`, the lyric line,
     transport; `/lodesong pause` typed with a caret; the transport flips to play.
- **Camera.** Each cut starts 1.15x and drifts to 1.0x, always toward the gold cover; the terminal ends on a fast push on the cursor.
- **Sound.** Four hits on the 2-beat cuts; terminal typing from typed cue list; on `enter` a clean click and the pad drops (the quiet pocket before the storm).

### S10 keyboard storm (beats 60 to 64, 136 BPM)
- **Image.** 1-beat hard cuts at the peak edit speed (4 cuts, 0.44 s each): `?` cheat sheet (real capture, searchable);
  `g` `h` chord stamping through pages (home, albums, artists flashing, each a real plate); `b` saves a moment (tick on the seek bar, real); the cheat-sheet pencil rebind. Keycaps appear huge (28 px legends min, caps 160 px) and are the foreground layer in sharp focus; plates are the soft background.
- **Camera.** Each cut a different move: push, pull, whip left, whip right. No wipes.
- **Sound.** Every keycap is a snare/tick on the beat; this is the percussion section. 

### S11 yours (beats 64 to 68, 138 BPM): 1-beat flashes
- **Image.** Six single-beat flashes at 3 to 4 frames overlap. Each is a real capture:
  airplane-mode glyph over a still-playing seek bar (offline); upload dialog dropping an album folder; library
  doctor with ticks; the share card unfurling (real `og-song.jpg`, 1200x630, shown at 1x so no upscaling) with the link; the **light theme** home
  (the one bright frame in the film: a flash on beat 3); fast scroll through the 10k-song list (speed-ramped plate sequence).
- **Camera.** Locked off, fast zooms. A 1-frame white-ish flash is the light theme itself, not an effect.
- **Sound.** Snare roll from the keyboard storm continues; a riser; the last beat has **silence for 8 frames** (the breath).
- **Note.** Because this is the fastest cut, every flash must be recognisable in 17 to 26 frames: only big, high-contrast plates.

### S12 land (beats 68 to 76, 138 BPM then ritardando)
- **Image.** Void. The **docker run** command types in (3 lines, mono, 28+ px, real command from the README, caret).
  On enter the gold cover appears behind it, then the whole **real app** (home plus lyrics panel plate) pulls back from
  the cover to full frame, **front-on, centred** (the finale rule), the gold thread settling as the seek bar. The
  wordmark `lodesong` (BrandMark) draws in below `your music. your server.`, then `github.com/FindMalek/lodesong`. Grain
  fades out over the last 12 frames; the last frame is pixel-sharp.
- **Camera.** Pull-back from 2.4x to 1.0x over 5 beats (ease-out), tilt to 0, motion blur on the first 2 beats.
- **Sound.** Impact and chord on the enter; last two beats ritardando (the score hands over to a G6-to-Am9 resolution with a 1.5 s tail); final hit then 1 to 2 s of tail, not a hard stop.

---------------------------------------------------------------------------------------------------------------------

## 5. Coverage matrix

Legend: **R** real capture (Playwright against the built app over the mock Navidrome), **M** faithful mock (React from real
primitives, only where capture is impossible), **A** real asset (committed screenshot in `docs/`), **C** caption chip only.

| feature | shot(s) | how it appears | source |
|---|---|---|---|
| Synced lyrics, word by word | S3, S4 | full-screen view, gold karaoke fill | R |
| Lyric nudge `[ ]` | S4 | toast + timing shift | R |
| Search by half-remembered lyric, play from line | S2, S3 | cmd-k typed, stroke under match | R |
| Search filters (`year:` `is:liked` `format:flac` …) | S2 (chip), S10 | chip and a flash of a filtered result | R |
| Click a line to play from there | S4 | cursor click, seek jump | R |
| Queue you can see, undo, reorder | S5 | drag row, cmd-z | R |
| Stop after this, sleep timer, balanced shuffle | S5 (chip), S10 (keys `⇧S` `s`) | chips and keycaps | C |
| Gapless, crossfade, EQ, ReplayGain, stream quality | S5 | crossfade covers, EQ bars, chips | R + M |
| Daily mixes / discover weekly / daylist | S6 | dither covers resolving in the made-for-you row | R |
| Playlist folders, aura | S6 | sidebar folders, drag in | R |
| Playlist from a prompt, mood search | S7 | typed prompt, playlist appears; `gym` flash | R |
| Recap / stats / history / forgotten favourites | S7 (stats draw-on), S11 (none) | stats page with SVG draw-on overlay | R + overlay |
| Radio that learns skips | S9 (chip) / S10 (key `r`?) | start-radio flash in S10 | R |
| Following + new releases feed | S11 flash (or S7 alt) | releases page flash | R (needs follow fixture) |
| Spotify follows via Lyterion | S11 chip `spotify follows via lyterion` on releases flash | caption | C |
| One session, device picker, handoff | S8 | desktop plus phone, gold line | R |
| Listen together | S8 (chip) | chip `listen together` and two-listener glyph | C |
| Arpeggi / Subsonic compat | S8 chips | chips | C |
| Mac app, notch island | S9.1 | real `docs/macos/*.png` | A |
| iPhone app | S9.2 | phone capture in device frame | R + frame |
| Android app | S9.3 | same capture, Android frame | R + frame |
| Linux and Windows app | S9.4 | window frame around capture | R + frame |
| Claude Code and OpenCode terminal | S9.5 | typed `/lodesong pause` | M |
| Scrobbling | S9 or S11 chip | `scrobbles to last.fm  listenbrainz` | C |
| Keyboard first: `?`, chords, rebind, moments, copy link | S10 | keycaps plus plates | R |
| Offline / service worker precache / PWA install | S11 | offline glyph over still-playing seek bar | R |
| Upload to inbox, library doctor | S11 | two flashes | R (doctor needs mock findings) |
| Share cards / OG unfurl, stop sharing | S11 | real OG tile, share link | A (+R toast) |
| Themes (light flash), dither art | S11 (light), S1/S3/S6 (dither) | light theme plate, dithered covers | R |
| Speed (10k rows, instant reload, 161 KB) | S11 | scroll through 10k list, chip `10,000 songs  ~40 rows rendered` | R |
| Accessibility (axe, screen reader), i18n, 320 px | S11 chip / S9.2 (phone) | chip only (honest: VoiceOver pass is still open in ROADMAP) | C |
| Self-hosting, docker run / compose / single binary | S12 | typed command | M (text) |
| Privacy: never touches your files, httpOnly session | S12 chip | `reads through navidrome's api  never touches your files` | C |
| Public demo `demo`/`demo` | cutdown + end of loop (chip) | text in S12 optional | C |

Coverage: 25 of 26 inventoried features are on screen or chipped; the 1 not shown is the PiP mini player / output-device
picker (ranked C, browser-specific). Roadmap-only items are deliberately not shown.

---------------------------------------------------------------------------------------------------------------------

## 6. Tempo ramp from cut lengths and what the score must change

**Principle.** The edit is the clock. Each shot has `beats` and a `bpm`; its length is `beats * 60 / bpm` seconds. BPM
rises per shot from 100 to 138; shot lengths on the same beat count shorten 4.62 s to 3.48 s (-25%), and the 4-beat
shots (S5, S7, S10, S11) fall from 2.07 s to 1.74 s. The score is generated from the same table.

```
bars:   S1 4@100  S2 8@104  S3 8@108  S4 8@112  S5 4@116  S6 8@120  S7 4@124  S8 8@128  S9 8@132  S10 4@136  S11 4@138  S12 8@138→ritard
```

**API (single source of truth, pure, no remotion import).** Replace the constant grid in `apps/video/src/design/beat.ts`:

```ts
export const FPS = 60;
export const TEMPO: readonly { beats: number; bpm: number }[]; // the table above, order = shot order
export const beat: (count: number) => number;           // frame of beat n, piecewise (cumulative seconds, round to frame)
export const bpmAt: (count: number) => number;
export const secondsOfBeat: (count: number) => number;  // for the audio script
```
`beat(n)` stays source compatible (`beat(4.5)` etc.), so every existing `beat(...)` call keeps working. Shot starts/lengths
(`timelines.ts` `HERO_SHOTS`) become derived from `TEMPO`. Tests: tempo table sums to the intended frame count; cut
frames are integers; `beat(a) < beat(b)` for `a < b`; every shot boundary lands within 0.5 frame of the ideal second.

**Score changes (`scripts/video-audio.ts`, `scripts/audio/*`, `apps/video/src/audio-cues.ts`).**
1. `bed.ts` has `BEAT_SECONDS = 60 / BPM` (a constant); replace with a per-beat time lookup `secondsOfBeat(n)` so kick,
   hats, bass, arpeggio and pad onsets follow the ramp. Note lengths expressed in beats scale with the local tempo; pad chord lengths per bar.
2. Harmony ascends with the speed: same four chords (Am9, Fmaj7, Cmaj9, G6) but the loop changes from 2 bars per chord
   (S1 to S4) to 1 bar (S5 to S8) to half-bar (S10, S11): harmonic rhythm doubles with the cut rate. Last two bars: ritardando into G6 to Am9, tail 1.5 s.
3. New sections (replace `SECTIONS.hero`): `cold open / find / drop / lyrics / queue / mixes / mood / session / shells / storm / yours (breath) / land`.
   The old `terminal` quiet pocket moves into S9.5 (the 2 beats after `enter`).
4. **Cues from the capture manifest** (new, `apps/video/src/audio-cues.ts` or `src/captures/cues.ts`): every key, click, line
   change, list row and device switch in the manifest has a frame in the film; `AUDIO_CUES` is generated by mapping
   manifest event times through each shot's start and playback rate. No hand-typed frame numbers for UI sounds.
5. Dynamics: S8 stays the loudest (~+3 LU over the rest), S10 and S11 are percussive (keys as snares), the breath at the
   end of S11 is 8 frames of true silence, the last hit has a 1.5 s tail. Keep `audio:check` green: cue alignment <= 1
   frame, no clicks, -14 LUFS integrated, true peak <= -1.5 dBTP, and add a check that onset spacing equals the tempo map (inter-onset interval of kicks follows `60/bpm`, within 2 ms).
6. Cutdown score: not a truncation: tempo 108 to 132 across the six cuts (section 8); reuse the same stems, re-arranged.

Honesty: nobody has listened to any of this (hard rule: never play audio). Numbers only. A human must judge timbre, the
ritardando and whether keycap percussion reads as music.

---------------------------------------------------------------------------------------------------------------------

## 7. Real-capture plan (scripts/hero)

Existing assets to reuse (read, not changed here): `scripts/hero/stack.ts` (mock Navidrome with 900 tracks on :4690, fixture on :4691, app on :4692,
temp data dir), `seed.ts` (`signIn`, `findSynced`, history seeding so mixes exist, search index build), `capture.ts`
(`open()` context with `reducedMotion`, frozen `currentTime` clock `FREEZE`, `stable()` pixel-stable screenshot loop,
`freezeAt`, lyric line `button[title$="click to play from here"]`, `expectHome`), `fixture.ts` (a Lyterion fixture),
`compose.ts`/`webp.ts` (README images). The 2x docs screenshots in `docs/` prove the approach works at 2880x1800.

**Method: plates and sequences, not screen recordings.**
- Deterministic. `scripts/capture-video.ts` (Playwright `recordVideo`, 1080p, VP8, wall-clock timing) cannot be re-timed to the beat grid
  or re-laid-out for 9:16 and compresses text; keep it only as a fallback for one organic clip.
- **Plates.** One PNG per UI state, captured with `stable()`: viewport **1440x810, deviceScaleFactor 2** (2880x1620). Push-ins up to 1.9x
  stay at >= 1.0 output pixel density at 1920 wide. Phone: 390x844 at DSF 3 (1170x2532), iPhone UA like `captureStrip`. Dark theme; one light-theme plate.
- **Sequences.** For anything that moves (typing, row drag, list scroll, lyric advance, device switch): step the interaction one
  unit at a time (type one char, scroll by N px, `dispatchEvent` per drag step) and call `stable()` after each; 30 stills/s of film time is plenty
  because Remotion interpolates the camera at 60. Time is the capture index, so the result is exact and replayable.
  Long sequences (the 10k scroll, 60+ frames) are encoded by ffmpeg to an all-intra mp4 (`crf 12`) and played with `OffthreadVideo`.
- **Manifest.** Every capture writes `apps/video/src/captures/manifest.json`: `{ id, file, w, h, dsf, events:[{t, kind:"key"|"click"|"line"|"device"|"row", target?:{x,y,w,h}}], boxes:{name:{x,y,w,h}} }`. Boxes come from
  `locator.boundingBox()` (play button, palette input, matched mark, devices button, the lyric line, mix tiles). The camera
  generator and the cue generator read it. Boxes are in CSS px of the plate.
- **Output.** `apps/video/public/captures/**` (gitignored like `public/clips`), regenerated by `bun run hero:film` (new root script) and
  checked in CI is not required (no binaries committed); only the manifest JSON (small) is committed.
- **Seed/state needs.** Reuse `seed()` for history so mixes exist. Extra: `follow` fixture for the following page (the Lyterion fixture in `fixture.ts`
  already serves followed artists; releases need the mock to return releases: verify), doctor findings (mock may return none: if so the doctor
  plate is a faithful mock), stats (history seeded, `docs/stats.png` proves it works), playlist folders (create 2 through the API, drag).
  Word-by-word lyrics need enhanced-LRC in the mock (verify `test/mock`; if absent, add word timings to the one featured song in `scripts/hero/fixture.ts` fixture only).

Capture list (id, how, outputs):

| id | how | outputs |
|---|---|---|
| `albums` | `goto /albums`, wait `a[href^="/album/"] img` nth(20) | plate |
| `album-lyrics` | `playFeatured()` (existing): album page, play the synced song, freeze at line N | plate + player bar |
| `cmdk-type` | press `Control+K`, type `lights on` one char at a time with `stable()` each | 8 plates + boxes (input, mark, row 1) |
| `play-from-line` | Enter on result 1, `freezeAt(starts[k])` | plate before/after (seek bar jump) |
| `lyrics-full` | `Shift+F` then `lines.nth(i).click()` per line (existing loop), also `]` once for the nudge toast | N plates + boxes of active line |
| `queue` | press `q`; drag row 6 to 2 in steps; `Meta+z` | sequence |
| `eq-crossfade` | settings, audio tab (sliders), crossfade slider drag | 3 plates (the EQ and cover overlay are drawn in Remotion over the plates) |
| `home-mixes` | `expectHome()` | plate + boxes of each mix tile |
| `mix-open` | click `daily mix 1` | plate |
| `folders` | create folders via API, drag playlist into folder, step | sequence |
| `ai-prompt` | open new-playlist dialog, type prompt char by char | sequence |
| `gym-search` | cmd-k `gym` | 2 plates |
| `stats` | `/stats` | plate (+ box of chart for the overlay) |
| `following` | `/following` | plate |
| `devices` | `getByRole("button",{name:"devices"})`, step to the picker, select iphone; phone context on the same session | desktop plates and phone plates, boxes |
| `phone` | iPhone viewport, now playing and queue | plates |
| `keys` | `?` sheet; `g` then `h`, `g` then `a`, `g` then `r`; `b` moment; `Shift+C`; step each | plates |
| `offline` | precache then `context.setOffline(true)`, seek, screenshot | plate |
| `upload`, `doctor` | `/upload`, `/doctor` | plates |
| `share` | copy share link toast, settings shared links | plates; the OG art itself is `docs/og-song.jpg` |
| `light` | `colorScheme: light` home | plate |
| `scroll-10k` | `/songs` with MOCK_TRACKS=10000, scrollTop += n per step | 120 plates, encoded to mp4 |

Not capturable, so faithful mocks: terminal integration (Claude Code/OpenCode), docker command, Mac notch (uses real `docs/macos/*.png`), Android (device frame around phone capture).
Frame art lives under `ui/` and is labelled as a frame, never claimed as a screenshot.

Capture honesty: all captures are the built app over generated data (invented names and lyrics, generated covers, no real music), same as the README hero.

---------------------------------------------------------------------------------------------------------------------

## 8. 9:16 cutdown (15 s) and README loop

### Cutdown (`cutdown-9x16.mp4`, 1080x1920, 60 fps, ~14.95 s, 30 beats)
Not a crop of the hero: re-framed for a phone. Plates are the phone capture (390x844, native 9:16-ish) and 9:16 slices of
the desktop plates (the lyrics panel, the palette, the picker). Safe box 900x1300 (left/right 90, top 250, bottom 370).
Tempo 108 to 132 across six cuts: 4@108 (2.22 s), 8@112 (4.29), 4@120 (2.00), 4@126 (1.90), 4@132 (1.82), 6@132 (2.73) = 14.96 s.

| # | beats | content | notes |
|---|---|---|---|
| C1 | 4 | the lyric hook: the monochrome cover resolves, `i keep the lights on` types big (96 px) | caption-free |
| C2 | 8 | cmd-k types `lights on`, enter, **ignite**, lyrics full screen word by word (stacked: cover above 78 px lines) | the whole message in one cut |
| C3 | 4 | mixes: 3 dither covers resolve in a vertical stack, one rushes forward | chip `mixes from what you play` |
| C4 | 4 | handoff: phone plate, gold line draws up to a laptop edge peeking at the top; `playing on iphone` | chip `one session` |
| C5 | 4 | 1-beat flashes: notch, terminal, keys (3 flashes) | chip `everywhere` |
| C6 | 6 | front-on end: wordmark, `your music. your server.`, `docker run` first line, URL; sharp last frame | 
Loudness rules as the hero (-14 LUFS, TP <= -1.5), score is the same stems at the cutdown tempo map. Captions: burn-in not needed (silent autoplay on socials): the chips are the captions, >= 40 px at 1080 wide.

### README loop (`loop-readme.mp4` plus animated WebP, 10 s, 960x540, 30 fps, silent, seamless)
Today: `loop-readme.mp4` 10 s 960x540. Keep the frame size and replace content with real captures:
20 beats at 120 BPM = 10.0 s, no audio. Content: lyrics full screen advancing 3 lines (0 to 3 s, gold word fill), cmd-k
types `lights on` (3 to 5 s), push into the mixes row where covers resolve (5 to 8 s), whip back to lyrics (8 to 10 s). **Seam:**
frame 0 and the last frame are the identical lyrics plate at identical camera pose; the last 12 frames ease the camera to
the pose and the active line to the same line. Verification: SSIM(frame 0, frame N-1) > 0.995 and no pixel pop.
Delivery: `docs/hero-loop-dark.webp`/`-light.webp` through the existing `scripts/hero/webp.ts` encoder (the README already uses `<picture>`
with `hero-dark.webp`/`hero-light.webp`), under 3 MB each; mp4 for the landing page. docs/*.md never reference images; the README is allowed.

---------------------------------------------------------------------------------------------------------------------

## 9. Risks (ranked)

1. **Capture determinism and fidelity.** The app has CSS transitions, virtualised lists and an audio clock (`FREEZE`
   patches `currentTime`). `stable()` (hash-equal screenshots) solves most, but a few states (crossfade, EQ, word-by-word fill, toasts) animate or rely on
   audio time. Mitigation: freeze the clock per frame (existing `freezeAt`), accept that EQ, crossfade overlay and
   karaoke fill are drawn in Remotion over a captured plate (the plate shows the static UI, Remotion supplies the motion; fidelity is by design, not capture).
2. **Mock data may not cover every feature.** Word timings, doctor findings, release feed, stats arc and 10k list need
   fixtures; if the mock lacks them the plate is empty or wrong. Mitigation: a 1-hour fixture audit before building shots; fall back to faithful mocks (`player-panels.tsx`) for doctor/releases and call them mocks in the QA report.
3. **Variable tempo through the audio script.** `bed.ts` assumes a constant BEAT_SECONDS; arpeggio, hats, pads, ducking envelopes and the onset check all assume a grid. Moving to a tempo map touches every renderer; risk of clicks at tempo changes and of drift between picture and sound. Mitigation: build the map as piecewise-constant per shot (no continuous ramp inside a shot), keep `audio:check` as the gate, add an onset-grid test against `bpmAt`.
4. **Render time and size.** 2880x1620 plates 1.9x, parallax slices, DOF blurs, light-pool masks, halation and `CameraMotionBlur` (xN samples) on 2287 frames at 60 fps: heavy. Mitigation: motion blur only on the 5 shots with big camera travel; `--concurrency` tuned; drop the blur radius over 12 px on large layers; pre-bake the blurred background plate; budget: target < 40 min full render; `--scale=0.5` for review.
5. **Upscaling artefacts on real assets.** `docs/macos/*.png` are 1280 px wide and OG tiles 1200x630: they are shown at <= 1.0 to 1.5x on a dark wallpaper, never full-bleed.
6. **Legibility vs speed.** 28 px minimum text and flashes of 17 to 26 frames in S10/S11: only keycap glyphs and one or two words per flash; run `bun run --cwd apps/video stills` and a read-test: freeze the 1 fps sheet at 0.5x, every flash must be nameable.
7. **Banding on the dark gradients and the dither/grain.** Dither is the identity but banding in the light pool/vignette on phones at low brightness is likely; keep grain on, 10-bit not available in H.264 yuv420p; render with `--pixel-format=yuv420p10le`? (not accepted by social players): keep 8-bit with grain.
8. **Truthfulness.** Android/iPhone/Linux/Windows shells are real products but the ROADMAP says the device passes are not done (VoiceOver, Android screen-off, Linux tray). The film shows them as existing apps, not as polished. Frames are labelled as frames and no caption claims what the roadmap lists as open ("lock-screen controls", "CarPlay", "hosted").
9. **Scope.** 12 shots plus cutdown plus loop plus capture rig plus tempo map is a lot for one PR; the build list is cut so each task can land and be reviewed separately.
10. **PR #522 conflict.** The builder is rewriting `scenes/*`, `audio-cues.ts`, PLAYBOOK on the same branch. Do not start T3, T4, T5 until #522 is merged or the owner says rebase; T1 and T2 touch new files and can start now.

---------------------------------------------------------------------------------------------------------------------

## 10. Build task list (ordered, parallel-safe)

Every task owns the files listed; no file appears in two tasks. Shared interfaces are defined first so agents work in parallel.
Branch: one issue per task or one branch with serial merges as the owner prefers. Commit messages `type(scope): subject`, <= 5 words; no push unless the owner says so.

**Interfaces to agree first (the owner of T0 writes them, 30 minutes):**
- `design/beat.ts` API in section 6 (`TEMPO`, `beat`, `bpmAt`, `secondsOfBeat`).
- Capture manifest schema (section 7) as a TypeScript type in `apps/video/src/captures/types.ts`, and `public/captures/<id>/…` naming.
- Plate component props: `<Plate id="cmdk-type" frame={n} />`, `<PlateSeq id fps at />`, `<Sliced id layers={[{box, z}]} />`.

| task | owner files (new unless noted) | depends on | deliverable |
|---|---|---|---|
| **T0 contracts** | `apps/video/src/design/beat.ts` (edit), `apps/video/src/design/beat.test.ts`, `apps/video/src/captures/types.ts`, `apps/video/STORYBOARD.md` (this file moved) | none | tempo map API, manifest type, tests. Land first; everyone imports these |
| **T1 capture rig** | `scripts/hero/film.ts`, `scripts/hero/film/*.ts` (one file per capture group), `scripts/hero/fixture.ts` (edit, only to add word-timing/releases data), root `package.json` script `hero:film`, `apps/video/public/captures/.gitignore`, `apps/video/src/captures/manifest.json` | T0 types | `bun run hero:film` makes every capture in section 7 plus the manifest; a one-page fixture audit note in the PR body |
| **T2 plate and lens engine** | `apps/video/src/design/plate.tsx`, `design/light-pool.tsx`, `design/dof.tsx`, `design/cursor.tsx`, `design/whip.tsx`, `design/halation.tsx`, `design/draw.tsx` (SVG draw-on, connection line), `design/camera.tsx` (edit: add `camTo(box)`, motion blur wrapper), `ui/frames.tsx` (edit: **delete crop marks, timecode**), `ui/keycap.tsx` (edit: large keycaps), tests | T0, can start with placeholders from `docs/*.png` | the lens kit, each with a probe still; HUD chrome removed |
| **T3 tempo-mapped edit** | `apps/video/src/scenes/timelines.ts` (edit), `scenes/film.tsx` (edit), `root.tsx` (edit), `scenes/timelines.test.ts` (edit), `design/song-clock.tsx` (edit) | T0 | new `HERO_SHOTS` table of 12 shots from `TEMPO`, empty shot registry, compositions `hero-16x9`, `cutdown-9x16`, `loop-readme` wired |
| **T4 score** | `scripts/video-audio.ts`, `scripts/audio/bed.ts`, `scripts/audio/voices.ts`, `scripts/audio/rig.ts`, `scripts/audio/dsp.ts`, `scripts/audio/loudness.ts`, `apps/video/src/audio-cues.ts`, `audio-cues.test.ts`, `audio-voices.test.ts`, `apps/video/scripts/audio-check.ts`, `apps/video/src/captures/cues.ts` | T0 | tempo-mapped bed, harmony rate doubling, sections renamed, manifest-driven UI cues, onset-grid test; `audio:check` green. Not listened to |
| **T5a shots S1 to S3** | `scenes/shot-cold-open.tsx`, `scenes/shot-find-line.tsx`, `scenes/shot-play-line.tsx`, `ui/dither-cover.tsx` (edit: ignite wave) | T1 plates S2, T2, T3 | three shots in Studio |
| **T5b shots S4 to S6** | `scenes/shot-lyrics.tsx`, `scenes/shot-queue.tsx`, `scenes/shot-mixes.tsx`, `ui/lyrics-close-up.tsx` (edit: karaoke fill, crop marks removed), `ui/eq-bars.tsx` | T1, T2, T3 | three shots |
| **T5c shots S7 to S9** | `scenes/shot-mood.tsx`, `scenes/shot-session.tsx`, `scenes/shot-shells.tsx`, `ui/device-frames.tsx`, `ui/notch-island.tsx`, `ui/terminal-mock.tsx`, `ui/stats-draw.tsx` | T1, T2, T3 | three shots; session shot is the proof of the 3D camera |
| **T5d shots S10 to S12** | `scenes/shot-keys.tsx`, `scenes/shot-yours.tsx`, `scenes/shot-land.tsx`, `ui/docker-block.tsx` | T1, T2, T3 | last three shots, end card with sharp last frame |
| **T6 cutdown and loop** | `scenes/cutdown.tsx`, `scenes/loop.tsx`, `apps/video/scripts/encode-loop.ts`, `scripts/hero/webp.ts` (edit, loop mode) | T5 shots (reuses their parts) | 9:16 and loop compositions, seam check |
| **T7 render, QA, docs** | `apps/video/scripts/check.ts`, `apps/video/scripts/docs-stills.ts`, `apps/video/docs-stills/*`, `apps/video/PLAYBOOK.md` (edit, last), `README.md` (loop `<picture>` swap only, owner approves), contact sheets in `~/Desktop/lodesong-promo/` | all | renders, 1 fps contact sheets, blackdetect, freeze/loop-seam SSIM, loudness, legibility gate, Studio load of every composition, knip/biome/comment lint, honest art-vs-merely-good note |

Order and parallelism:
1. T0 (alone, short).
2. T1, T2, T3, T4 in parallel (disjoint files; T2 and T3 work off `docs/*.png` placeholder plates until T1 lands).
3. T5a, T5b, T5c, T5d in parallel once T1 has produced plates and T2/T3 are merged.
4. T6.
5. T7.
Review gate after step 3: the director (me) reviews 1 fps frames of the assembled hero against this storyboard and sends a revisions list (28% faster pass: tighten every shot by 2 to 6 frames, cut dead air).

Each task has a verification list: `bun run --cwd apps/video typecheck`, `test`, `stills` (legibility gate), biome, knip, the comment-lint budget, no `Math.random`/`Date`, fonts via `staticFile`, whole-number dimensions.

---------------------------------------------------------------------------------------------------------------------

## 11. Honest framing of the end result

- What would be art: the gold thread across real pixels, the accelerating edit where the score is built from the same table as the cuts, the match cuts on the cover.
- What will be merely good: the faithful mocks (terminal, device frames), the speed-flash section (it is a montage, however fast), the score timbre (synthesised from sine/saw/noise, unheard).
- What a human must judge by ear and eye: the score (timbre, ritardando), whether every flash in S10 and S11 is readable on a phone at 100% size, and banding in the light pool on a real phone at low brightness.
