# lodesong commercial: Remotion playbook

Written 2026-11-08 against Remotion 4.0.541, revised after an independent review. Everything marked **[built]** exists in `apps/video` and was rendered. Everything marked **[spec]** is the plan. Claims carry a source URL; claims with no URL are analysis or were measured on this Mac.

What is proven: an agent working from this file built and checked one 8 s scene (`scene-open`) with executable checks (hold times, beat grid, rendered text size, safe area, audio onsets). What is not proven: that an agent can build scenes S2 to S6 from the tables in section 13 without a human art director, or that the result is a premium commercial. The first scene is a good template, not finished art (see section 12). Section 16 lists confidence and open risks.

Not published to the docs site on purpose (`docs/*.md` is). Do not move it there.

## 0. Read first

- The proof scene (`scene-open`, 8 s, 60 fps) renders in about 25 s warm. See section 12 for the numbers and what it taught us.
- The hardest craft problem is not tooling, it is **UI legibility**: a 1280x800 app window shown whole at 1080p makes 13 px UI text about 14 px tall. Every hero moment is a close-up with its own layout for that crop (`ui/lyrics-close-up.tsx`), not a zoom on the whole window. The floor is executable: `bun run --cwd apps/video stills` fails when a tagged text renders under 28 px or 60% opacity.
- Decisions only the owner can make are in section 14. The storyboards are written so those decisions are plain-text constants in one file (`src/copy.ts`).

## 1. Stack decisions and why

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | Remotion 4.0.541, React 19, one pinned version for every `remotion` and `@remotion/*` package | the app is React, so real `@lodesong/ui` components and the real theme CSS mount directly. Remotion's own docs say to pin one exact version across packages ([releases](https://github.com/remotion-dev/remotion/releases)) |
| Alternative considered | HeyGen `hyperframes` (HTML + GSAP, skills on skills.sh) | strong anti-generic craft rules, but a different runtime and CLI; we keep its rules (approved stills, numeric lint, role-based easing) not its engine. [hyperframes repo](https://github.com/heygen-com/hyperframes) |
| Alternative considered | screen recordings via Playwright (`scripts/capture-video.ts`) | authentic but cannot be re-timed to beats or re-laid-out for 9:16. Keep only for one or two "real hands" shots |
| UI source | React recreation from real primitives (`@lodesong/ui` `Button`, `Kbd`, `Badge`, `BrandMark`, real `theme.css`, real `@lodesong/shared/dither`) with scripted state **[built]** | deterministic, frame-accurate, re-layoutable. The full app (`PlayerBar`, `LyricsView`) is not mountable as is: it reads global stores (`player`, `useSession`, queries, `useEngineController`). Tier 2 below fixes that |
| Frame rate | 60 fps authoring (`FPS = 60`) | UI motion looks crisp; 120 BPM gives 30 frames per beat (integer). 30 fps export is a cheap downgrade. At 30 fps one beat is 15 frames, also integer ([beat maths](#3-motion-language)) |
| Frame format | PNG frames (`Config.setVideoImageFormat("png")`) | keeps 1 px hairlines and dither cells exact. jpeg is fine for drafts |
| Output | H.264 `--crf=16`, `yuv420p`, BT.709 for social (`Config.setColorSpace("bt709")` in `remotion.config.ts`; v4's `default` is bt601 since 4.0.424 and the file was untagged before, [render flags](https://www.remotion.dev/docs/cli/render)); ProRes HQ for a master | [encoding docs](https://www.remotion.dev/docs/encoding.md): h264 CRF 1-51 default 18; ProRes profiles at [prores](https://www.remotion.dev/docs/prores.md). Ship 8-bit to social: X and YouTube require 4:2:0 ([X](https://docs.x.com/x-api/media/quickstart/best-practices), [YouTube](https://support.google.com/youtube/answer/1722171)) |
| Audio | generate our own score and SFX in `scripts/video-audio.ts`, mix outside Remotion to one master, mux one `<Audio>` | zero licence risk, repo is MIT. See section 9 |
| Fonts | IBM Plex Sans Variable + JetBrains Mono Variable via `@fontsource-variable/*` (the app's own fonts, OFL) | brand match; OFL allows use in video with no credit ([OFL FAQ](https://openfontlicense.org/ofl-faq/)) |
| Render location | the Mac, locally | one 30 s film is minutes locally; Lambda is about $0.02 per minute of video ([cost example](https://www.remotion.dev/docs/lambda/cost-example.md)) but adds nothing for one hero film. CI is optional (section 11) |

### Licence you must know about

Remotion is source-available, not open source. The Free License covers an individual, a for-profit company of up to 3 people, a non-profit or an evaluator; headcount is total company headcount, and responsibility sits with whoever owns the project ([LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), [FAQ](https://www.remotion.dev/docs/license/faq)). lodesong is MIT and individually owned, so the owner is covered; **a contributor who renders from this repo needs their own eligibility**. Open question for Remotion support: the owner's employer headcount, if any. Remotion 5 changes some terms ([migration](https://www.remotion.dev/docs/5-0-migration.md)).

## 2. Skills installed (project scope, not committed)

Installed with `npx skills add <repo> -a claude-code -s <names> -y --copy` from the repo root. They land in `.claude/skills/`, `.agents/` and `skills-lock.json`, all in the repo `.gitignore` (`.claude-plugin/marketplace.json` is separate and tracked). Nothing was installed globally. The `skills` CLI itself sends anonymous install telemetry; it prints a "review skills before use" warning.

I read every `SKILL.md` and every bundled script and grepped all of them for network calls, eval, shell-outs, base64, chmod, secrets and safety bypasses.

| Skill | Source | Version | Verdict |
| --- | --- | --- | --- |
| remotion-best-practices, -create, -markup, -studio, -render, -captions, -saas, -interactivity, -docs, -license, -upgrade, -multimedia, -maps (13) | `remotion-dev/skills` | frontmatter `4.0.541` (lock hashes in `skills-lock.json`) | **safe, first party.** Notes below |
| frontend-design, canvas-design | `anthropics/skills` | no version | **safe.** Prose only; canvas-design bundles OFL fonts with licence files |
| motion-design | `lottiefiles/motion-design-skill` | `1.0.0`, MIT | **safe.** Prose; useful easing and duration tables |
| animation-vocabulary, apple-design, choreograph, improve-animations, review-animations | `emilkowalski/skills` | no version | **safe but use as vocabulary only.** Web/CSS oriented (CSS transitions do not render in Remotion). Each opens with a canned "initial response" rule; ignore it |

Flags worth knowing:

- `remotion-docs` tells the agent to POST to an Algolia search endpoint with a **public search-only key** embedded in the skill (the remotion.dev docs search key). Not a secret, not exfiltration. Appending `.md` to any docs URL is the cheaper path.
- `remotion-captions` says to fetch `basic-captions.tsx` from remotion.dev and copy it unchanged. That is fetch-and-copy of first-party source, not execution. **Read it before committing it.**
- `remotion-markup/voiceover.md` shows an ElevenLabs call using `process.env.ELEVENLABS_API_KEY`. An example only; we do not use voice-over.
- `remotion-upgrade` runs `npx remotion upgrade` / `npx skills update`. Only on request.
- `remotion-maps/techniques/*/scripts/*.mjs` are local scripts that read and write local GeoJSON; they `import` `@turf/turf` if you run them. No network. Irrelevant to us.
- The umbrella skills ship nested duplicate copies (291 files total). Harmless bloat.
- Not installed: the `heygen-com/hyperframes` skills (different runtime). skills.sh lists `product-launch-video` and `music-to-video` under that repo, but the repo's `skills/` folder listing I could fetch has only `figma`, `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use`, `remotion-to-hyperframes`, `reverse-any-video`, `slideshow`, `style-sampling`. Unresolved; treat skills.sh counts as unverified. [skills.sh](https://skills.sh/)

How to refresh: `cd apps/video && bunx remotion upgrade` upgrades packages and project-local skills ([skills docs](https://www.remotion.dev/docs/ai/skills)).

## 3. Motion language

Source of truth in code: `src/design/motion.ts` **[built]**. The rules:

- **BPM 120, FPS 60, one beat = 30 frames.** Every start frame and duration is `beat(n)` (`design/beat.ts`, pure so scripts can import it); never type frame numbers. Structural moves (cuts, assemble, exits) land on integer or half beats. UI hits (key press, focus change, lift) land on beats 2 and 4 of the bar, which is `beat(n)` with odd `n`. `scenes/*-timeline.ts` holds every event of a scene in beats and the unit test `bun run --cwd apps/video test` fails on an off-grid event. If a different BPM is ever chosen, round from time: `Math.round(n * fps * 60 / bpm)`; 128 BPM gives 28.125 frames per beat at 60 fps so never accumulate.

  | BPM | frames/beat @30 | @60 | bars in 30 s |
  | --- | --- | --- | --- |
  | 100 | 18 | 36 | 12.5 |
  | 120 | 15 | 30 | 15 |
  | 124 | 14.52 | 29.03 | 15.5 |
  | 128 | 14.06 | 28.13 | 16 |

- **One signature curve**: `ease.out = bezier(0.16, 1, 0.3, 1)` (expo-out feel) for every entrance and move; `ease.in = bezier(0.7, 0, 0.84, 0)` for exits at about 60% of the entrance length; `ease.inOut = bezier(0.65, 0, 0.35, 1)` only for camera drift. No default `ease`, no bounce, zero overshoot on type and covers. Apple's own position: springs are the only animation that keeps continuity but bounce is optional ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158)).
- **Durations at 60 fps**: entrance 18-36 f, exit 10-22 f, micro tick 6-12 f, camera push 90-180 f. 150 ms = 9 f, 300 ms = 18 f, 600 ms = 36 f.
- **Stagger** 2-4 f per item, whole stagger under about 24 f; never uniform on everything. Roles first (lead, support, decoration, static), then timing. [choreograph skill](https://github.com/emilkowalski/skills)
- **One mover at a time.** The lead moves first and furthest; support follows with less; decoration only fades.
- **Anticipate sound by 1-3 frames**, then verify numerically (section 10).
- **Motion blur**: shutter angle 180, only on whip pans and big moves. `<HtmlInCanvasMotionBlur>` is the recommended one from 4.0.529 and cost grows with `samples` ([docs](https://www.remotion.dev/docs/motion-blur/html-in-canvas-motion-blur.md)). Not used in the proof.
- **No CSS `transition`/`animation`, no Tailwind `animate-*`, no `Math.random`, no `setTimeout`.** Everything from `useCurrentFrame()`. [flickering](https://www.remotion.dev/docs/flickering.md), [remotion-markup skill](https://www.remotion.dev/docs/ai/skills). Use `hash()` (deterministic) or `random(seed)`.

## 4. Shared design system for video

Tokens come straight from the product: `src/index.css` imports `packages/ui/src/styles/theme.css`, and every scene sits in a `.dark` wrapper **[built]**. Never copy hex values into video code; use `var(--background)` etc.

| Token | Value | Use |
| --- | --- | --- |
| void | `color-mix(in oklch, var(--background), black 55%)` | scene backdrop, darker than the app so the window separates |
| surface | `--background` `#101010`, `--card` `#191919` | panels |
| ink | `--foreground` `#ebebeb` | the single "current" item, headline line 1 |
| mute | `--muted-foreground` `#939393` | headline line 2, labels |
| hairline | `--border` `#262626`, 1 px at 1080p (2 px for a 4K master) | all rules, crop marks, panel borders |
| radius | 0 | nothing is rounded, ever |
| fonts | IBM Plex Sans (display, 500, tracking -0.045em), JetBrains Mono (labels, timecode, numerals) | two families only |
| colour | none, with one exception: `--ignite` (gold, `oklch(0.84 0.15 82)`, `src/index.css`) is spent once per film, on the cover of the song that is playing, the moment it starts to sing. Destructive red only if showing an error | the product is monochrome; the exception is a film decision awaiting the owner (section 14) |

Type scale at 1080p (our floor, from research: phone viewing is about 1/4 size; Netflix reading ceiling is 42 chars/line, 20 chars/s, [style guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide)):

| Role | Size | Notes |
| --- | --- | --- |
| hero line | 176 px (proof) up to 220 | 3-6 words, 2 lines max, lowercase like the brand |
| second line | 96-120 px | |
| mono label | 26 px caps, tracking +0.08em, tabular nums | never below 24 px |
| timecode / meta | 20 px | decoration only |
| UI text in frame | must read at 28 px equivalent on the 1080p frame and at 60% opacity or more | build a close-up layout, do not zoom the whole window |

The floor is checked, not eyeballed. Tag the text that carries the message with `data-legible`; list the frames where it must be on screen in the scene timeline (`HERO_FRAMES`). `src/design/probe.tsx` measures the rendered height (computed font size times the projected box ratio, so 3D tilt and scale count) and the opacity chain of every tagged element, and `scripts/check.ts stills` fails when one is under 28 px or 60%. Wide "mood" shots keep their small UI text untagged on purpose and are judged by eye; the same pass also fails when a settled panel leaves the 56 px crop-mark safe area or crosses the timecode.

Hold rule, also executable: each text item must be fully visible for 0.5 s plus 0.3 s per word (`TEXT_ITEMS` in the timeline, tested in `open-timeline.test.ts`).

Safe areas: 5-8% inset (96-150 px x, 54-86 px y) for copy. Crop marks sit 56 px in **[built]**. For 9:16 use the 900 x 1300 px box (left/right 90, top 250, bottom 370, right 150 clear) from third-party platform guides ([Reels](https://www.hopperhq.com/blog/instagram-reel-size/), [TikTok](https://www.revid.ai/tiktok-safe-zone)); these are unofficial, check in the real app preview.

**Texture layer** (always last in the stack):

- `Grain` **[built]**: 480x270 noise canvas re-seeded per frame, drawn at 4 px cells, `mix-blend-mode: overlay`, opacity 0.07. Deterministic through `hash(i + frame * 7919)`. It crawls like emulsion.
- `Vignette` **[built]**: black 30% at the edge, nothing over the middle (stays out of the way of the UI).
- `DitherCover` **[built]**: the app's `ditherCells`/`ditherPath` from `@lodesong/shared/dither`, plus a `develop` prop that keeps only a hashed share of cells, so a cover "develops" dot by dot, and a `color` prop for the one ignite moment.
- Backdrop dither field **[built]**: a 1080 px `DitherCover` behind the type, masked radially, drifting with `time`.
- **Next [spec]**: a real post effect. `<HtmlInCanvas effects={[…]}>` with a custom `createEffect` Bayer dither (WebGL2) and the built-in `noise`/`halftone`/`duotone`/`scanlines`, pin `--preferred-effect-backend=webgl2` and `--gl=angle`. There is **no built-in ordered-dither or threshold effect** in `@remotion/effects` as of 4.0.541, so one custom effect is needed. Ordered (Bayer) dither is stateless per pixel, so it is identical on every frame; error diffusion shimmers. [effects](https://www.remotion.dev/docs/effects/api.md), [html-in-canvas](https://www.remotion.dev/docs/html-in-canvas.md)
- **Banding**: avoid dark gradients; use ordered dither or halftone as the gradient. Lossy encoders quantise away dither added before the encode, so add texture at the last compositing step and test on a phone at low brightness ([banding notes](https://www.forasoft.com/learn/video-encoding/glossary/terms/dithering)).

## 5. Component kit

Existing **[built]** in `src/`:

| Piece | File | Notes |
| --- | --- | --- |
| beat grid | `design/beat.ts` | `FPS`, `BPM`, `beat()`; pure, imported by the audio script and the checks |
| easings | `design/motion.ts` | `ease`, `ramp()`, `lerp`, `hash` |
| font gate | `design/fonts.tsx` | `FontGate` holds every frame (`delayRender`) until the brand fonts are decoded |
| grain, vignette | `design/grain.tsx` | |
| mask-up type, mono label | `design/kinetic.tsx` | `MaskLine` rises out of a clipped box and leaves through the top |
| probe | `design/probe.tsx` | logs rendered text size, opacity and panel boxes for `scripts/check.ts` |
| dithered cover | `ui/dither-cover.tsx` | |
| app panels | `ui/player-panels.tsx` | `Sidebar`, `Main`, `Lyrics` (continuous `focus`, scrolling), `PlayerBar`, built from the real `Button`, `Kbd`, `Badge`, `BrandMark` and lucide icons |
| lyrics close-up | `ui/lyrics-close-up.tsx` | the hero layout for 1920x1080: 92 px lines, 440 px cover, key chip. Its own layout, not the app panel scaled |
| copy and fixtures | `copy.ts` | every string on screen, plus the fake album, tracks and lyrics |
| scene | `scenes/open.tsx`, `scenes/open-timeline.ts` | the timeline holds all events in beats (visuals, score, checks read it); the camera rig is still inline |

To build **[spec]**, in this order (each gets its own Composition in Studio so it can be reviewed alone):

1. `Camera` component: keyframed `{x, y, scale, rotateX, rotateY, focus}` with named presets (`push`, `settle`, `whip`) so scenes stop hand-rolling transforms. Aspect-aware: takes a focal point per ratio.
2. `Scene` shell: `FontGate` + void + `Vignette` + chrome + `Grain` + audio, so a scene is only its content.
3. `Chrome`: crop marks and timecode extracted from `open.tsx`.
4. `QueuePanel`, `MixGrid` (dither covers), `DeviceFrame` (macOS window, iPhone, Android, terminal), `Terminal` (typing at irregular 60-110 ms/char, block caret about 1 Hz), `KeyChip` (square hairline keycap pressing 2-4 px for 3-4 f; show the keystroke that triggers the feature, as Raycast-style films do).
5. `Cursor`: bezier path, ease-out with 3-8 px arc, 3-6 f hesitation before a click, ring ripple 12-18 f. Default is **no cursor**; use keycaps.
6. `BeatPulse`: reads `beats.json` (emitted by the audio script) and exposes `pulse(frame)` for hits.
7. Props via zod or inline `defaultProps` so copy lives in one `copy.ts` and Studio can edit it (Studio infers controls from inline defaultProps since 4.0.516, [schemas](https://www.remotion.dev/docs/schemas.md)).

### Real UI tiers

- **Tier 1 [built]**: recreate from real primitives and real tokens. Safe, fast, deterministic.
- **Tier 2 [spec]**: mount real app components behind a `MockProviders` harness: stub the `player`/`session`/query modules with webpack aliases in `Config.overrideWebpackConfig`, feed playback position as `frame / fps`, disable the real engine, silence audio, and disable hover and CSS animation globally. Feasible for presentational pieces (rows, covers, lyric lines); the full `PlayerBar` needs the aliasing work first. Estimate: a day.
- **Tier 3 [spec]**: real captures. `bun scripts/screenshots.ts` against the mock-backed app gives pixel-true stills at 2x (viewport 1440x900, `deviceScaleFactor: 2`); use them as textures for close-up cutaways or to diff the recreation against reality. Use `<Img>` and `staticFile`.

## 6. Asset pipeline

1. Run the mock-backed app (`bun run mock`, see `test/mock/server.ts`; `scripts/demo/*` already generates art with `cover.ts`, audio with `synth.ts`, catalog with `catalog.ts`). Everything shown on screen is generated: no real album art, no real artists.
2. `apps/video/public/` holds git-ignored media: `audio/`, `clips/`, `music/` (`apps/video/.gitignore`). Only `docs-stills/` (small jpg keyframes) and code are committed.
3. Asset manifest [spec]: `src/assets.ts` exporting typed `staticFile` paths and a `tracks.ts` with the fixture songs, so a missing file fails the type check, not the render.
4. Screenshots refresh: `bun scripts/screenshots.ts`. Playwright clips for authentic hands: `bun scripts/capture-video.ts`.
5. Real UI copy only: every UI label in a shot must exist in the app source (grep for it in `apps/player/src`; `en.json` has only the `history` strings so far, so it cannot be the source) and live in `src/copy.ts`. Marketing lines (headline, captions) are copy too but are not UI labels, so they are flagged as such there. No invented UI labels. [EveryInc/product-launch-video](https://github.com/EveryInc/product-launch-video)

## 7. Install, run, render (all verified on this Mac, Apple Silicon, node 24.13, bun 1.4.2, ffmpeg 9.0.2)

```bash
bun install                                   # repo root
bun run --cwd apps/video audio                # writes apps/video/public/audio/open.wav (git-ignored, generated from the cue table)
bun run --cwd apps/video dev                  # runs audio first, then Remotion Studio; add --no-open --port=3917 for headless
bun run --cwd apps/video stills               # ALL keyframes, one bundle, plus the legibility and safe-area checks
bun run --cwd apps/video still -- scene-open out/f300.png --frame=300   # one frame
bun run --cwd apps/video render               # out/open.mp4, h264 crf16, 1080p60, bt709
bun run --cwd apps/video onsets               # audio onsets of out/open.mp4 against the cue table
bun run --cwd apps/video test                 # hold times and beat grid
bun run --cwd apps/video render:gif           # out/open.gif (every 3rd frame, half size)
```

`dev`, `still`, `stills`, `render` and `render:gif` run `audio` first, because `public/audio/open.wav` is not committed.

Notes measured on the proof:

- The first bundle is slow (about 2 minutes including the Tailwind v4 compile, plus a one-time 140 MB Chrome Headless Shell download on a fresh machine). A warm bundle takes about 1 s.
- `npx remotion` does not resolve in this workspace; the scripts call the local binary through `bun run`. From a shell: `apps/video/node_modules/.bin/remotion`.
- Do not loop `remotion still` in a shell: every call re-bundles (6 bundles cost 144 s cold). `scripts/check.ts stills` bundles once through `@remotion/bundler`, passes the serve URL to `renderStill`, and renders 8 frames in about 6 s warm. It must pass `webpackOverride: enableTailwind` itself, because the Node API does not read `remotion.config.ts`. Another way is `remotion bundle` once and a serve URL for each `remotion still`.
- Typecheck, lint and dead code stay clean: `bun run typecheck`, `bunx biome ci`, `bunx oxlint`, `bunx knip`. oxlint's comment budget (3% of lines, blocks of 2 lines max) applies to `apps/video` too; write code that needs no comments.
- Remotion packages are pinned exactly to `4.0.541` in `apps/video/package.json`. Add new ones with the same version (`bunx remotion add <pkg>` does this).
- Tailwind v4 is wired with `Config.overrideBundlerConfig(enableTailwind)`, the name the current docs use ([tailwind](https://www.remotion.dev/docs/tailwind)); `overrideWebpackConfig` also works but is the older name.

## 8. Prompt library

How people prompt Remotion agents, distilled. Sources: [Remotion Claude Code docs](https://www.remotion.dev/docs/ai/claude-code), [prompt gallery](https://www.remotion.dev/prompts) (Presscut, OpenClawd, VVTerm are product-video prompts), [EveryInc launch-video skill](https://github.com/EveryInc/product-launch-video), [Lago's storyboard.json method](https://getlago.com/blog/we-killed-our-motion-design-job), [Kiln's write-up](https://hn.jakechampion.name/reader/https://kiln.tech/blog/we_made_our_launch_video_in_claude_code), [Tella guide](https://www.tella.com/blog/how-to-use-remotion-agent-skills-with-claude-code.md), [hyperframes review/motion/look rules](https://github.com/heygen-com/hyperframes).

What worked everywhere: a human writes the message and script; tokens before scenes; a component kit before scenes; a storyboard table with frame ranges approved before code; audio or beat grid first; one scene per prompt; render stills and look; a separate critic pass; commit after each approved scene.

What failed: linear easing and lone opacity fades; every element entering the same way; bouncy springs everywhere; flat solid backgrounds; invented UI copy; CSS animation; fonts and images not ready at the frame; agents guessing frame numbers without seeing output (about 100 prompts for a 50 s film in one founder's account); agents changing too much in one edit. Kiln built animation before recording voice and had to re-cut: **audio first**.

Reusable prompts (paste as is; replace `[…]`). Each assumes the skills in section 2 and this file.

**P1 brief**
```
Read apps/video/PLAYBOOK.md and the remotion-best-practices skill. We are making [length]s [ratio] for lodesong.
Message the viewer must remember: [one sentence]. Features allowed on screen: [list]. Tagline: [text or "propose 3"].
Real assets only: generated covers and fixtures in apps/video/src, labels from apps/player/src/locales/en.json. Invent nothing.
Do not write code. Reply with the questions you need answered, then a plan.
```

**P2 storyboard (approve before code)**
```
Write apps/video/STORYBOARD.md as a table: beat | frames (60 fps, beat(n) form) | seconds | what is on screen | exact on-screen text | camera | audio cue | role of each moving element (lead/support/decoration).
Rules: product on screen by 3 s; one idea per beat; every line holds 0.5 s + 0.3 s per word after it settles; no dead stretch over 3 s; the end card holds 2 s; frames sum to [N].
Mark the focal point per aspect ratio. Stop and wait for my approval.
```

**P3 design system (only if tokens change)**
```
Edit only apps/video/src/design/*. Extend tokens: [what]. Keep one signature easing; no new easing without a role. Add a banned-looks list as a failing type test where possible (no bounce, no gradient, no radius). Do not touch scenes.
```

**P4 component**
```
Build [Component] in apps/video/src/ui or design. Real @lodesong/ui primitives where they exist, token colours only, useCurrentFrame/interpolate only, clamp all extrapolation, no Math.random/Date.now/CSS animation. Give it its own <Composition id="kit-[name]"> with 3 states. Render stills at start, mid, end and describe each as a stranger would.
```

**P5 scene (one beat at a time)**
```
Build scene [id] from STORYBOARD.md rows [x-y] only. Use beat(n) for every start. Lead, support, decoration roles stated in a 3-line plan first. Do not touch other scenes or the motion tokens.
After building: render stills at the first frame, each hit frame and the last frame, Read them, fix clipped text, overflow, low contrast, anything that needs explaining. Report render time.
```

**P6 audio sync**
```
Regenerate the score with scripts/video-audio.ts for the new beat list (bpm 120, 48 kHz). Render, extract the audio, run the onset check from PLAYBOOK section 10 and list every cue more than 2 frames from its visual event. Fix visuals, not audio, unless the cue itself moved.
```

**P7 critic (stills only, fresh context)**
```
Here are [20] stills in order and nothing else. Review as a stranger. One line per problem: time | where | problem | exact change | what stays. Rank P0 (breaks the read), P1, P2. Check: unreadable or clipped text, UI text under the 28 px floor, dead stretch over 3 s, empty first frame, default AI looks (bounce, lone fades, centred everything, flat backgrounds, gradients), anything that needs explaining. No score. If busy, cut a third of the motion.
```

**P8 cutdown / aspect ratio**
```
Add a [9:16] composition from the same scene components. Do not scale the 16:9 layout: define focal points and re-layout per ratio in the scene (stack, crop, font scale). Keep text inside the 900x1300 safe box. Show stills of every beat in both ratios before rendering.
```

**P9 export and QA**
```
Run PLAYBOOK section 11. Print exact commands, file sizes, duration, loudness (ebur128), peak, and the onset check. Do not change visual design.
```

## 9. Sound and music

**Decision: our own score, zero licence.** `scripts/video-audio.ts` **[built]** synthesises an 8 s placeholder at 120 BPM, 48 kHz stereo (kick with pitch sweep, hats, ticks, riser, sub, whoosh, key clicks, a gold-moment bloom chord, soft drone) and writes `apps/video/public/audio/open.wav`. It plays the `CUES` table of `scenes/open-timeline.ts`, the same table the visuals read, so a retimed event moves its sound too. The same approach scales to the full film: add a 4-bar intro (pad), build (kick, hat), drop (full), outro (filter down, tape stop), one cue table per scene. Reuse voices from `scripts/demo/synth.ts` (seeded, but 44.1 kHz and no drums; add a `sampleRate` option).

Why not a library track: the repo is MIT and a CC-BY/NC file cannot ship with it; Content ID claims on YouTube and Instagram are the real risk for any free library (Pixabay tracks marked with a shield are Content ID-registered, a claim is not a strike but a rejected appeal can become one: [Pixabay FAQ](https://pixabay.com/service/faq/)).

| Item | Source | Licence | Attribution | Risk |
| --- | --- | --- | --- | --- |
| score, drums, bass, pad | own script | own work (MIT) | no | low |
| ticks, clicks, hits, risers, crackle, tape stop | own script | own work | no | low |
| optional extra UI SFX | Kenney Interface / UI / Impact packs ([kenney.nl](https://kenney.nl/assets/category:Audio)) | CC0 (confirm per pack) | no | low |
| optional extra SFX | Freesound, CC0 filter only ([FAQ](https://freesound.org/help/faq/)) | CC0 | no | low-med (fingerprint collisions) |
| fallback score | ElevenLabs Music, paid plan ([terms](https://elevenlabs.io/music-terms), read 2026-11-08) | commercial use, you keep rights; excludes film/TV/radio | no (paid) | low-med (platform AI label) |
| fallback score | Stable Audio, paid ([explainer](https://stability.ai/explainers/stable-audio-vs-competitors-licensing-export-rights-and-self-hosting-compared)) | you own output under the Community License (< $1M) | no | low-med |
| fallback score | commissioned indie track | written master and sync licence, all media, perpetual, "no Content ID registration" clause | per contract | low if complete |
| fallback score | Kevin MacLeod ([FAQ](https://incompetech.com/music/royalty-free/faq.html)) | CC BY 4.0 | **yes, on every platform** | med |
| **do not use** | Remotion's `remotion.media` SFX | blanket "royalty-free" claim but many are meme clips of unknown provenance (`vine-boom`, `windows-xp-error`, `spongebob-fail`…) | n/a | **high** |
| **do not use** | BBC sound effects (RemArc, non-commercial), MusicGen weights (CC BY-NC), Udio (downloads disabled), Instagram in-app music on a brand account | | | high |

All licence readings are 2026-11-08, secondary sources flagged in the research; re-check before relying on any fallback. This is not legal advice.

**Mix**: build the mix outside Remotion and mux a single master. Loudness is measurable, there is one decoder path, and SFX placement and animation share one cue list. Remotion's `<Audio>` from `@remotion/media` extracts audio with Mediabunny; keep `interpolate()` inline for fades ([audio](https://www.remotion.dev/docs/media/audio.md)). Remotion renders at 48 kHz and resamples anything else ([sample rate](https://www.remotion.dev/docs/sample-rate)). Ship WAV because it is lossless and has no decoder surprises, not because anything needs it: `useWindowedAudioData` accepts every Mediabunny-supported format since v4.0.383 and was WAV-only before ([docs](https://www.remotion.dev/docs/use-windowed-audio-data)).

```bash
ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -
ffmpeg -i mix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=<I>:measured_TP=<TP>:measured_LRA=<LRA>:measured_thresh=<thresh>:offset=<offset>:linear=true" -ar 48000 -c:a pcm_s24le master.wav
```

Target -14 LUFS integrated, true peak -1.5 dBTP, AAC-LC stereo 48 kHz (-14 is the consensus for YouTube, Reels, X, TikTok; none publish official numbers for the last three: [Fora Soft](https://www.forasoft.com/learn/audio-for-video/articles-audio/lufs-targets-per-platform-2026), [X audio spec](https://docs.x.com/x-api/media/quickstart/best-practices)). **The proof's placeholder measures -17.9 LUFS, peak -1.3 dBFS on the encoded mp4; run `loudnorm` before publishing anything.**

Craft rules: sub-bass hit (40-60 Hz) on the logo, paired with a mid transient because phones do not reproduce sub; a half-beat of silence before the last hit; 1-2 s tail, not a hard stop; duck music 2-4 dB under impacts (`sidechaincompress`, 10-30 ms attack, 150-300 ms release); few SFX, aligned to the exact frame; picture and captions must carry the story with sound off because most social viewing is muted.

## 10. Review loop

Never deliver an unverified render. For every scene:

0. **Executable rules first**: `bun run --cwd apps/video test` (hold times, beat grid, UI hits on beats 2 and 4) must pass before any render.
1. **Stills at keyframes**: first frame, every hit frame, last frame. One command bundles once and renders them all (8 stills, about 6 s warm):
   ```bash
   bun run --cwd apps/video stills          # out/stills/f<frame>.png, exits 1 on a failed rule
   ```
   It also fails when tagged UI text renders under 28 px or 60% opacity at a hero frame, when a settled panel leaves the 56 px safe area or crosses the timecode. Then **Read each image** and describe it as a stranger would. Anything that needs explaining is a P0.
2. **Contact sheet** of a full render:
   ```bash
   ffmpeg -i out/open.mp4 -vf "fps=2,scale=480:-1,tile=4x3" -frames:v 1 out/sheet.png
   ```
3. **Numbers over eyes**: dead stretches (no scene change for over 3 s: `ffmpeg -vf select='gt(scene,0.02)',showinfo`), text below the 28 px floor, empty first frame, silence with `silencedetect`.
4. **Frame diff between iterations** to prove a change did only what you meant: `ffmpeg -i old.mp4 -i new.mp4 -lavfi ssim -f null -` (1.0 = identical) or `psnr`.
5. **Audio sync**: `bun run --cwd apps/video onsets` decodes `out/open.mp4`, finds transients (a raw and a high-passed envelope, so quiet clicks on top of a kick are found) and prints the offset of every `detect` cue from its frame. On the proof, 8 detectable cues all sit at +0.0 frames. Read that for what it is: the score is generated from the same cue table the visuals read, so this proves the score is on the beat grid and that the encode and mux did not shift it, not that an independent visual event lands on a sound. The visual side is checked by the stills at the hit frames. A true visual check (extract event frames from the rendered video, for example with `select=gt(scene,x)`) is not built.
6. **Critic pass** with P7 in a fresh context, stills only. Write findings to a `REVIEW.md` per scene, with the weakest shot and what went unchecked ([hyperframes review rules](https://github.com/heygen-com/hyperframes)). Never score out of 10.
7. **Phone check**: the final export on a real phone at low brightness (banding shows there).
8. **Studio preview** while building: keep Studio running; do not render until asked ([remotion-best-practices](https://www.remotion.dev/docs/ai/skills)).

## 11. Render and export matrix

| Deliverable | Comp | Size | fps | Command | Budget |
| --- | --- | --- | --- | --- | --- |
| hero 16:9 | `hero` | 1920x1080 | 60 | `remotion render … hero out/hero.mp4 --codec=h264 --crf=16 --x264-preset=slow` | YouTube/X: any; ~30-40 MB at 30 s is fine |
| X / LinkedIn feed | same, downscaled | 1280x720 or 1920x1080 | 30 | `ffmpeg -i hero.mp4 -r 30 -c:v libx264 -crf 18 -c:a copy x.mp4` | X API (read 2026-11-08): H.264 High, AAC LC, 4:2:0, 60 fps or less; post video 20 min by default (125 min Premium), `total_bytes` up to 16 GB; the page lists dimensions 32x32 to 1280x1024 and recommends 1280x720, which a 1920x1080 file exceeds, so this is the 720p downscale row and a real upload test is still required ([X](https://docs.x.com/x-api/media/quickstart/best-practices)) |
| vertical 15 s | `hero-vertical` | 1080x1920 | 30 or 60 | `remotion render … hero-vertical out/vertical.mp4 --crf=16` | Reels ~90 s max (sources disagree), keep under 50 MB; keep text in the 900x1300 box |
| square / 4:5 | `hero-square` | 1080x1080 / 1080x1350 | 30 | same pattern | |
| README loop | `loop` (no grain, 6-8 s) | 960x540 | 15-20 | mp4 `--crf=24` under 10 MB, or gif | GitHub: 10 MB videos on free repos, 100 MB paid, `.mp4/.mov/.webm`; the docs do not say README autoplay, **verify in a test repo** ([attaching files](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)) |
| gif | `render:gif` | 960x540 | 20 | script above | **proof: 8.8 MB with grain**. Grain defeats GIF; render the loop comp without grain, use ffmpeg `palettegen` + `paletteuse=dither=bayer` |
| master | | 1920x1080 or `--scale=2` | 60 | `--codec=prores --prores-profile=hq` | ProRes HQ ~220 Mbps; canvas and effects need `pixelDensity={usePixelDensity()}` at `--scale=2` ([scaling](https://www.remotion.dev/docs/scaling.md)) |
| transparent overlay | | | | `--image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444` | ([transparent](https://www.remotion.dev/docs/transparent-videos.md)) |
| poster / og | `Still` | 1200x630 | | `remotion still … --image-format=jpeg` | `og:video` is a bonus; poster `og:image` is the safe default ([Mux](https://www.mux.com/docs/guides/embed-videos-for-social-media)) |

Captions: burn in anything spoken or explanatory for muted autoplay (`@remotion/captions`, [docs](https://www.remotion.dev/docs/captions)); lyrics shown as UI are content, not captions. Add alt text and a plain-text description when posting. No flashing faster than 3 per second.

**CI**: not needed for a single hero film. If wanted: a `workflow_dispatch` job on `ubuntu-latest` running `remotion render` and uploading the mp4 as an artifact ([ssr docs](https://www.remotion.dev/docs/ssr.md)); GitHub runners have no GPU so use `--gl=swangle` for anything WebGL ([gl options](https://www.remotion.dev/docs/gl-options.md)); sub-pixel output differs from a Mac, so render the committed film on one machine type. Determinism checklist: pin Remotion, pin `--preferred-effect-backend=webgl2`, pin `--gl`, bundle fonts locally, no unseeded randomness, no `Date.now()`.

## 12. What the proof scene taught us (measured)

Scene `scene-open`, 480 frames, 1920x1080 at 60 fps, 8.0 s, placeholder score:

- Render: **22 to 25 s** through `bun run render` (two runs, audio included, warm bundle, about 20 fps rendering speed); cold first bundle about 2 min. mp4 **4.1 MB**, `h264 yuv420p`, tagged `bt709` (checked with ffprobe: `color_space`, `color_transfer`, `color_primaries` all `bt709`; before the config change they read `unknown`). Peak -1.3 dBFS, -17.9 LUFS. The 8 keyframe stills with all checks take 6 s.
- Executable checks that ran green: hold times and beat grid (unit test), hero text 92 px (lyric line) and 28 px (key chip) at 100% opacity, wide shot inside the 56 px safe area and clear of the timecode, 8 detectable audio cues at +0.0 frames. Each check was also shown to fail on a bad value (the floor set to 100 px fails the close-up).
- The Tailwind v4 pipeline, the real `theme.css` and the real `@lodesong/ui` components all mount and render with no webpack surgery beyond `enableTailwind`.
- The shot order is: type (0 to 3 s), lyrics close-up with one gold moment (3 to 6 s), hard cut to the wide app (6 to 8 s). The close-up carries the message; the wide shot is proof that it is a real app.
- Lessons: (1) a naive `min(width/1920, height/1080)` scale for 9:16 shrinks the wide window to a thin strip in a black page. **A vertical cutdown needs its own framing**, not a scale. (2) The whole window at 1080p is a mood shot, never a read: its UI text stays untagged and the message moves to a layout built for the crop. (3) Grain plus PNG frames is fine for H.264 but ruins GIF size. (4) Muted `#939393` text plus overlay grain plus vignette reads dim; dimming other panels to 50% made the first version illegible, the wide shot now dims 20%. (5) A `box-shadow` ring on a `preserve-3d` stage does not follow the flying panels and reads as misregistration; shadows live on each panel and fade as it lands (so settled panels in one plane do not shade each other). `filter` on a 3D parent flattens its children, so do not use it there.

What it is not: the honest read of the first version was "restrained, well typeset, Linear-adjacent house style, a good template, not art". The second version adds a real hero close-up and one deliberate moment (the dithered cover turns gold as the lyric line lands), which is the first frame in the film with a reason to be remembered. It is still a monochrome house style with one accent; the wide shot is dark and flat; there is no second surprise after the gold; the score is a placeholder. Treat it as the best frames so far, not as a finished commercial.

## 13. Storyboard and beat sheet

Constants: `FPS = 60`, `BPM = 120`, `beat(n) = 30n`. 30 s = 1800 frames = 60 beats = 15 bars. All text lowercase like the brand (track titles and lyrics are data, written lowercase in the fixtures). Tagline, features and order are placeholders until the owner decides (section 14). Rule: every shot must advance the story or be cut ([Lago](https://getlago.com/blog/we-killed-our-motion-design-job)). Cut on the downbeat of a bar; UI hits land on odd beats (beats 2 and 4 of a bar); each text item holds 0.5 s plus 0.3 s per word.

Scene budget (beats and frames): S1 0-16 (0-480), S2 16-26 (480-780), S3 26-36 (780-1080), S4 36-46 (1080-1380), S5 46-54 (1380-1620), S6 54-60 (1620-1800). Cut count: 6 hard cuts at 360 (inside S1), 480, 780, 1080, 1380, 1620 plus internal moves.

### Kit pieces that are not built, and what they block

| Piece | Blocks | Notes |
| --- | --- | --- |
| Scene shell (`FontGate`, void, vignette, chrome, grain, audio) | all scenes | today it is copied from `scenes/open.tsx`; extract before S2 |
| Camera (keyframed `x, y, scale, rotate`, presets) | S2 push, S3 lateral, S4 arc | S1 uses an inline rig, enough for one scene |
| KeyChip (extract from `lyrics-close-up.tsx`) | S2 (`q`) | already built inline |
| QueuePanel | S2 | uses `FIXTURE.tracks`; 40 px type for the close-up |
| MixGrid (dither covers in a row, merge) | S3 | `DitherCover` exists; needs the merge motion |
| DeviceFrame (macOS window, iPhone) | S4 | no phone art exists; draw as hairline frames |
| Terminal (typed lines, caret) | S4, S5 | irregular 60 to 110 ms per character |
| BrandMark large + URL line | S6 | `BrandMark` exists in the player; sizing is untested |

### S1 `scene-open`, frames 0-480 **[built]**

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | hairline draws edge to edge (to beat 1), crop marks, timecode | none | inline | locked | tick, pad |
| 1 | 30 | line 1 mask-up (settles at beat 2) | `your music.` | `MaskLine` | locked | tick |
| 2 | 60 | line 2 mask-up (muted); mono label fades in (settles at 2.5) | `your server.`, `self-hosted music player` | `MaskLine`, `Label` | locked | tick |
| 4 | 120 | dither field behind the type keeps drifting | none | `DitherCover` | locked | riser (2 beats), hats from 4.5 |
| 5.5 | 165 | headline and label leave through the top (15 f) | none | `MaskLine` | locked | riser peaks |
| 6 | 180 | key chip rises; cover starts to develop dot by dot (ink) | `y`, `synced lyrics` | `LyricsCloseUp` | locked close-up | sub, whoosh, kick every beat |
| 7 | 210 | `y` presses 4 px; lyric lines mask-up, centre first | lyric lines in `copy.ts` | `LyricsCloseUp` | locked | click |
| 9 | 270 | focus moves to `i keep the lights on`; cover ignites gold over 15 f, glow blooms | none | `LyricsCloseUp` | locked | bloom chord |
| 11 | 330 | focus moves to `hold the signal violet` | none | `LyricsCloseUp` | locked | soft tick |
| 12 | 360 | hard cut to the wide app; lyrics panel in place, main flies at 360, sidebar +0.25 beat, bar +0.5 beat | none | `Main`, `Sidebar`, `PlayerBar`, `Lyrics` | rotateY -7 to -4, rotateX 5 to 2, scale 1.00 to 1.06 over 4 beats | sub, whoosh, kick |
| 13 | 390 | lyrics panel lifts 60 px forward, the others dim 20% | none | `Lyrics` | continues | click |
| 16 | 480 | end | | | | tail |

### S2 queue, frames 480-780 (beats 16-26) **[spec]**, blocked by Scene shell, Camera, KeyChip, QueuePanel

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | 480 | hard cut; queue panel mask-up, row 1 playing | `signal violet pt. 2` | `QueuePanel` | locked close-up on the queue column | sub, whoosh, kick |
| 17 | 510 | `q` chip presses; rows 2 to 6 rise, 0.25 beat apart | `q`, `queue` | `KeyChip`, `QueuePanel` | locked | click |
| 19 | 570 | row 4 drags to position 2, others shift (20 f) | `add to queue` is the real label; rows from `FIXTURE.tracks` | `QueuePanel` | slow push 1.00 to 1.04 over 16-26 | click, hat pattern thickens |
| 20 | 600 | caption mask-up (5 words, holds to beat 25) | `the queue is always visible` | `MaskLine` | push continues | none |
| 21 | 630 | next-up row slides in from the right | `next up` is not in the app yet; check before using | `QueuePanel` | push continues | soft tick |
| 24 | 720 | riser; caption leaves at beat 25 | none | | | riser to 26 |

### S3 mixes, frames 780-1080 (beats 26-36) **[spec]**, blocked by Scene shell, Camera, MixGrid

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | 780 | hard cut; three source covers develop, 0.25 beat apart | none | `MixGrid`, `DitherCover` | slow lateral, 40 px over the scene | mix chord, kick |
| 28 | 840 | covers slide together toward the centre | none | `MixGrid` | lateral | whoosh |
| 29 | 870 | covers merge into one mix cover (ink, not gold: gold means playing) | `daily mix 1` | `MixGrid` | lateral | click |
| 30 | 900 | caption mask-up (5 words, holds to beat 35) | `mixes from what you play` | `MaskLine` | lateral | bass line enters |
| 31 | 930 | row of covers resolves, labels one per half beat | `daily mix 2`, `daily mix 3`, `discover weekly`, `daylist` | `MixGrid`, `Label` | lateral | hats |
| 35 | 1050 | caption leaves | none | | | riser to 36 |

### S4 one session, frames 1080-1380 (beats 36-46) **[spec]**, blocked by Scene shell, Camera, DeviceFrame, Terminal

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 36 | 1080 | hard cut on the full drop; laptop window mask-in, phone frame 0.5 beat later | none | `DeviceFrame` | arc starts, 12 deg over the scene | full drop, sub |
| 37 | 1110 | play pressed on the laptop | `play` | `DeviceFrame`, `KeyChip` | arc | click |
| 38 | 1140 | caption mask-up (4 words, holds to beat 44) | `one session. every device.` | `MaskLine` | arc | none |
| 39 | 1170 | position jumps on phone and terminal line in sync | `1:11` style clocks from `clock()` | `DeviceFrame`, `Terminal` | arc | click |
| 40-44 | 1200-1320 | chips appear one per beat | `web`, `macos`, `ios`, `android`, `desktop` | `Label` in hairline boxes | arc | tick per chip |
| 45 | 1350 | everything holds, caption leaves | none | | | riser to 46 |

### S5 terminal, frames 1380-1620 (beats 46-54) **[spec]**, blocked by Scene shell, Terminal

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 46 | 1380 | hard cut; prompt and block caret blink (about 1 Hz) | none | `Terminal` | locked, tight | music filters down |
| 46.5 | 1395 | typing at 60 to 110 ms per character | `lodesong now` | `Terminal` | locked | key ticks (not on the grid, they follow the characters) |
| 49 | 1470 | enter; now-playing block resolves | `signal violet pt. 2`, `satellite garden` | `Terminal` | locked | click |
| 50 | 1500 | echo of the opening line mask-up (settles at 51, holds to beat 54) | `your server.` | `MaskLine` | locked | soft tick |

### S6 end card, frames 1620-1800 (beats 54-60) **[spec]**, blocked by Scene shell, BrandMark large

| Beat | Frame | Event | Exact copy | Component | Camera | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| 54 | 1620 | hard cut to void; half a beat of silence | none | shell | none | silence |
| 54.5 | 1635 | sub hit with a mid transient | none | | none | sub + mid transient |
| 55 | 1650 | brand mark mask-up, large | `lodesong` | `BrandMark` | none | |
| 56 | 1680 | URL line fades in, holds to the end (2 s) | `github.com/FindMalek/lodesong` | `Label` | none | tail to 1800 |

Every row above is a plan. The S1 table is the only one that has been built and checked.

### Vertical cutdown 15 s, 9:16, composition `hero-vertical` (900 frames at 60 fps, 30 beats)

| Frames | Seconds | Screen | Notes |
| --- | --- | --- | --- |
| 0-90 | 0-1.5 | hairline vertical, `your music.` / `your server.` stacked, hero font 130-160 px, inside the 900x1300 box | hook inside 2 s |
| 90-150 | 1.5-2.5 | headline out, cover develops full width (square), centred | one strong image |
| 150-540 | 2.5-9 | lyrics hero: the close-up layout re-laid-out for 9:16 (not scaled); `y` chip; lines scroll on beat; one gold moment | the single feature |
| 540-750 | 9-12.5 | phone and terminal strip with synced position; chips stack | proof of one session |
| 750-900 | 12.5-15 | end card: wordmark, URL, 1.5 s hold | sub hit at 780 |

Layout rule for ratios: scenes take `layout: "wide" | "tall"` from `width / height`, size everything in a unit of width or height, and each scene defines its own focal crop per ratio ([Lago](https://getlago.com/blog/we-killed-our-motion-design-job); `useVideoConfig`: [docs](https://www.remotion.dev/docs/use-video-config)).

### Scene contract for agents

A scene is two files plus copy: `scenes/<id>-timeline.ts` (pure: `FRAMES`, the event table `T`, `CUES`, `TEXT_ITEMS`, keyframes) and `scenes/<id>.tsx`; its strings live in `src/copy.ts`; its Composition is `scene-<id>`. Every start frame and duration is `beat(n)`; geometry and eased values are plain numbers. UI hits land on odd beats and structural moves on integer or half beats (the test enforces it). Text that must be read is tagged `data-legible` and listed in `HERO_FRAMES`. It passes `bun run --cwd apps/video test`, `stills` and `onsets`, then P5 and P7 review. The first version of this contract demanded `FRAMES` exports, `copy.ts`, a `scene-[id]` Composition and "events on beats 2 and 4" while the one scene broke all of them; `scene-open` now meets them, with two honest amendments: "never type frame numbers" covers timing only, and "beats 2 and 4" means odd `beat(n)`, so the key press is at `beat(7)`, not at 5.5.

## 14. Decisions only the owner can make

1. Tagline and brand voice (the proof uses the old `your music. your server.`). Lowercase, deadpan, or warmer?
2. Which 3 features lead (queue, mixes, one session, lyrics, terminal now-playing, share links, listen together, offline)?
3. Music taste: techno/ambient bed at 120 BPM (own synth, free) or a commissioned/AI track (cost, licence risk)?
4. Comparison: may we name Spotify or other services? Plain-text names only, no logos, factual claims; nominative fair use is a US doctrine, laws differ elsewhere ([overview](https://ccbjournal.com/articles/beach-boy-playmate-and-five-guys-boston-walk-courtroom-nominative-fair-use-trademarks)). Not legal advice.
5. Audience and channel priority (X, YouTube, README, landing page) which sets the cuts, the loudness and whether a sound-off version leads.
6. Remotion licence eligibility for contributors who may render (section 1; `CONTRIBUTING.md` carries one line about it).
7. The gold accent: the app is monochrome and the film spends colour once, on the playing cover. Keep it, move it, or stay monochrome?

## 15. Research source index

- Remotion docs: [skills](https://www.remotion.dev/docs/ai/skills), [Claude Code](https://www.remotion.dev/docs/ai/claude-code), [effects](https://www.remotion.dev/docs/effects/api.md), [html-in-canvas](https://www.remotion.dev/docs/html-in-canvas.md), [TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries.md), [media Video](https://www.remotion.dev/docs/media/video.md), [encoding](https://www.remotion.dev/docs/encoding.md), [gl options](https://www.remotion.dev/docs/gl-options.md), [flickering](https://www.remotion.dev/docs/flickering.md), [performance](https://www.remotion.dev/docs/performance.md), [tailwind](https://www.remotion.dev/docs/tailwind.md), [bundlers](https://www.remotion.dev/docs/bundlers.md), [ssr-node](https://www.remotion.dev/docs/ssr-node.md), [license FAQ](https://www.remotion.dev/docs/license/faq).
- Newest features worth using later (4.0.4xx-4.0.54x): `@remotion/media` `Video`/`Audio`, `@remotion/effects`, `HtmlInCanvas`, `HtmlInCanvasMotionBlur`, `lightLeak` for `TransitionSeries.Overlay`, `cube`/`zoomBlur`/`iris` presentations, WebGPU effect backend with `--preferred-effect-backend`, `Interactive.*` for Studio editing, `useWindowedAudioData` for audio visualisation. Chrome Headless Shell renders HtmlInCanvas with no flag; Studio preview needs a Chrome with `chrome://flags/#canvas-draw-element` ([chrome-headless-shell](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell.md)).
- Not verified in research (check before relying): per-render price on Vercel Sandbox, Remotion plan prices, whether a `--gl=metal` option exists (none documented), bit-identical output of WebGPU effects across machines, `@remotion/noise`/`@remotion/shapes` prop lists.
- Craft: [Lago Linear-style film](https://getlago.com/blog/we-killed-our-motion-design-job), [Spotify Wrapped 2025 in Rive](https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025), [Wistia video length](https://wistia.com/blog/optimal-video-length), [Apple springs](https://developer.apple.com/videos/play/wwdc2023/10158). No primary making-of exists for Linear, Raycast, Arc, Vercel Ship, Teenage Engineering or Nothing films; per-brand notes in research are analysis, check by eye against the real films.
- Platforms: [X](https://docs.x.com/x-api/media/quickstart/best-practices), [YouTube](https://support.google.com/youtube/answer/1722171), [GitHub](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files). Reels, TikTok safe zones and LUFS targets are unofficial.
- Licences: [Pixabay terms](https://pixabay.com/service/terms/), [Incompetech](https://incompetech.com/music/royalty-free/faq.html), [OFL FAQ](https://openfontlicense.org/ofl-faq/), [Kenney](https://kenney.nl/assets/category:Audio), [Freesound](https://freesound.org/help/faq/).

## 16. Confidence and open risks

- **High confidence**: the toolchain (pinned 4.0.541, Tailwind v4, real `@lodesong/ui` and theme, bt709 tag, bundle-once stills), the beat grid and hold-time rules (tested), the legibility floor and safe-area rules (measured from the rendered DOM and shown to fail on bad values), the licence table for the own-score decision.
- **Medium**: the S2 to S6 tables. They are written to the same rules as S1 and pass the hold-time arithmetic on paper, but no kit piece for them exists, and unbuilt scenes tend to collide with the 28 px floor (queue rows, terminal text) in ways only a render shows.
- **Low**: that this is a premium commercial. It is a tasteful, consistent house style with one good moment. No human art director has judged it; nobody has watched it on a phone; the score is a placeholder at -17.9 LUFS.
- **Not measured**: motion quality of the gold ignite and the cut (stills only, nobody has watched the render), banding on a phone, GitHub README autoplay, X upload acceptance of 1080p, per-platform loudness.
- **Risks**: Remotion licence terms change in 5.0; the gold accent breaks the product's own "no colour" rule; naming Spotify in a comparison is a legal question; a 30 s film of five product features may be the wrong film for the audience (owner call).
- **Owner questions** (section 14): tagline and voice, the three lead features, music taste or commissioning, naming Spotify in a comparison, primary channel, the gold accent, Remotion eligibility.
