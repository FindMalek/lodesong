# Contributing

## Setup

```sh
bun install
bunx playwright install chromium
bun run mock                                   # fake Navidrome on :4599, login demo / demo, 10k tracks
NAVIDROME_URL=http://127.0.0.1:4599 bun run dev  # app on :8080
```

## Checks

CI runs the same steps on every PR, and `main` only takes green PRs.

| command | what |
|---|---|
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `bun run format` | Biome lint + format (`format` fixes) |
| `bun run test` | unit tests (`*.test.ts` next to the code) |
| `bun run e2e` | Playwright against the mock server (`e2e/*.e2e.ts`) |
| `bun run size` | production bundle vs the gzip budget in `scripts/bundle-size.ts` |
| `bun run config-docs` | regenerate `docs/configuration.md` after changing `apps/api/src/settings.ts` |
| `bun run shortcuts-docs` | regenerate `docs/shortcuts.md` after changing `apps/player/src/app-shortcuts.ts` |
| `bun run screenshots` | refresh the README screenshots from a running instance (`SCREENSHOT_URL`, `_USER`, `_PASSWORD`) |
| `bun run check` | everything except e2e |

## UI components

The UI is shadcn/ui on Base UI (style `base-lyra`) plus the [audiocn](https://audiocn.dev) registry. Never hand-roll
something the registries have:

```sh
bunx shadcn add tooltip            # shadcn component -> apps/player/src/components/ui/
bunx shadcn add @audiocn/waveform  # audiocn component, hooks -> apps/player/src/hooks/, helpers -> apps/player/src/lib/audio/
```

Those three folders are vendored: Biome skips them, and changes there should be small and on purpose (re-adding a
component overwrites them). Current local edits, to redo after re-adding: `slider.tsx` thumb uses `bg-background`;
`sidebar.tsx` imports its mobile sheet from `components/lazy-sheet.tsx` (keeps a dialog out of the first screen);
`command.tsx` keeps the dialog's screen-reader title inside `DialogContent` (outside, it sits outside every landmark);
`audio-player.tsx` always takes our engine as `player` (its internal `<audio>` fallback and `useAudioPlayer` are dropped,
which keeps that hook off the first screen); `sidebar.tsx` gets its tooltip components from `lib/tooltips.ts` (loaded
after the first screen) and only wraps buttons in a tooltip trigger while collapsed. `context-menu.tsx` was written from `dropdown-menu.tsx`
on Base UI's ContextMenu (the registry was unreachable when it was added); replace it with `bunx shadcn add context-menu`. App code composes them in `apps/player/src/components/`. Icons are `lucide-react` (the shadcn default). Tailwind v4 runs through
`bun-plugin-tailwind` (`bunfig.toml` for dev, `scripts/build.ts` for the production executable).

## Rules

- One issue, one PR. Branch with `gh issue develop <n> --checkout`, PR body says `Closes #<n>`.
- Commits: `type(scope): subject`, subject ≤ 5 words, lowercase, imperative (`fix(lyrics): offset drift`).
- Tests: one focused test per behavior or bug. Pure logic gets a unit test; flows and shortcuts get an e2e test.
  Mock only the network (the mock Subsonic server), never our own modules.
- Playback is checked by sound, not by the pause button: `e2e/audio-output.e2e.ts` reads what reaches the speakers (`tapOutput`), and the mock streams real mp3 and opus tones (`format=`) that `/mock/fault` can break per song.
- Playback that starts with no tap (the macOS island and media keys) and the output device path are in `e2e/audio-gesture.e2e.ts`; the macOS app's real WKWebView, built exactly like `PlayerView`, is exercised by `swift test` in `apps/macos` (needs `bun scripts/build.ts` first). Both inject `test/output-tap.js`, and neither makes sound: the e2e tap routes to a zero gain, the harness mutes its web view (see `apps/macos/README.md`). Without an audio output device the harness skips the loudness checks locally and fails them in CI.
- The mock server lives in `test/mock/`. When the app calls a new Subsonic endpoint, add it there in the same PR.

## How it ships

`bun run build` bundles the web app into `dist/web` (minified, code-split, hashed names), precompresses every file
(brotli + gzip), and compiles the server with those files embedded into one executable, `dist/lodesong`. In
production the server serves them itself: hashed assets `immutable`, `index.html` `no-cache` with the CSP header. In
development (`bun run dev`) Bun bundles on the fly with hot reload instead. e2e tests always run the executable.

A service worker (`apps/player/src/sw.ts`, built to `/sw.js`) keeps the app shell for offline, serves covers cache-first, and
downloads the next three songs into an LRU audio cache it serves Range requests from (`lib/offline.ts` is the page
side). Albums and playlists can be kept offline (pinned, never evicted).

Pages are separate chunks (`apps/player/src/routes.tsx`), preloaded when a link is hovered or focused and all fetched once the
browser is idle. The first screen is budgeted (`bun run size`) and the home page must score ≥ 93 on Lighthouse
desktop and ≥ 70 on mobile (slow 4G, 4x CPU; `e2e/lighthouse.e2e.ts`). `e2e/interactions.e2e.ts` budgets the slowest input
event while a 10k-song list is opened, scrolled and played. `bun run size` also fails when `recharts` or `cmdk` reach the
first screen. Every CI run uploads the first-screen sizes (`perf-trend-size`), and a release also uploads Lighthouse
desktop and mobile numbers (`perf-trend-<version>`) to compare release to release.

## Deploys

Pull requests and merges to `main` run the checks and the e2e suite (4 shards) on GitHub's runners; pull requests also
build the image and smoke-test it read-only. Nothing ships on a merge: release-please keeps a release PR open, and
merging it builds `ghcr.io/findmalek/lodesong` (amd64, with SBOM and provenance) on the self-hosted runner, tags
`:X.Y.Z`, `:latest` and `:main`, runs Lighthouse, and, when the `DOKPLOY_WEBHOOK_URL` secret is set, calls the Dokploy
webhook and waits for `$PLAYER_URL/api/health`. Every PR gets its own Dokploy preview and a sticky comment with its status, logs and link.
Setup: [docs/deploy/dokploy.md](docs/deploy/dokploy.md).

New settings go in `apps/api/src/settings.ts` (parsed and checked at boot), then `bun run config-docs`.

## Translations

Strings live in flat catalogs, `apps/player/src/locales/<language>.json` (`en.json` is the source of the keys; `{count}` picks
`.one` / `.other`). A component is converted by calling `useT()` from `@/lib/i18n`; from then on the `i18n/no-literal-text`
lint rule rejects literal text in its JSX. Only `history` is converted so far; other languages load lazily and the choice is
a device setting (settings, appearance). Add a language: a new `<language>.json` with the same keys (a unit test checks),
and an entry in `LANGUAGES`, `LOADERS` and the settings type.
