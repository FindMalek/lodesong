# Accessibility

What has been checked, what hasn't, and the checklist for the part that needs a person.

**The manual screen-reader pass (VoiceOver on iPhone and Mac, NVDA on Windows) has not been done.** Nothing here
claims it has. The automated and code-level checks below are a floor, not a substitute.

## Automated (runs on every pull request)

`e2e/a11y.e2e.ts` runs axe (WCAG 2 A/AA plus best practices) in light and dark on:

- every page: home, albums, album, artists, artist, songs, genres, genre, folders, playlists, playlist, liked, history,
  stats, lyrics, moments, radio, upload, import, doctor, listen, search results, login
- every settings tab, and the sessions dialog
- the player with the queue and lyrics panels, the search palette, the cheat sheet and an open menu

Also asserted there:

- 375 px and 320 px wide: no axe violations and no sideways scroll (WCAG reflow)
- each page has one `main`, exactly one visible `h1`, and every `nav` is labelled
- closing a menu returns focus to the button that opened it

Other e2e files cover keyboard operation (`every-shortcut.e2e.ts`, `focus.e2e.ts`, `shortcuts.e2e.ts`).

## Built in

- `lang="en"`, a "skip to content" link first in the tab order
- one `aria-live="polite"` announcer says "now playing <title> by <artist>" when the song changes; the lyrics are
  not a live region, so they do not chatter while a song plays; the only other live regions are the offline banner and the
  "up next" card near the end of a song (`role="status"`)
- the app has no animation at all (`app.css`: `animation: none; transition: none` everywhere except the loader and the
  refresh line), so `prefers-reduced-motion` has nothing to turn off
- playlists move into folders by drag or from "move to folder…" (the playlist menu and the playlist page), a plain select
  that works from a keyboard or a phone
- track lists take a move-up / move-down edit (`ListEditing.move`) next to dragging; whether it is discoverable with a screen
  reader is on the manual list

## Found and fixed by the automated pass

- `/radio` with no station had no `h1`
- the top search result's cover button had no accessible name
- the sessions list was a `role="list"` whose items were not list items

## Manual checklist (still to do)

Run each with a screen reader and note anything that is announced wrongly, twice, or not at all. File findings as
issues.

Screen readers: VoiceOver on macOS (Safari), VoiceOver on iPhone (Safari and the installed app), NVDA on Windows
(Firefox and Chrome). Also walk each flow keyboard-only.

| flow | what to check |
|---|---|
| sign-in | labels read, the error is announced (`role="alert"`), focus lands somewhere sensible after success |
| sidebar and pages | landmarks list (banner, navigation, main, complementary), heading outline, page change is announced |
| player bar | button names and state (play/pause, like, shuffle, repeat), seek slider value reads as time, volume |
| now playing | the announcer says it once per song, not on every seek or buffer |
| queue | list reads as a list with position, reorder alternatives work, remove is announced |
| search palette | combobox + listbox pattern: the active result is read as arrows move, "see all results" reachable |
| lyrics | the panel is readable without chatter, current line is findable, sync does not steal focus |
| settings dialog | focus trapped, tabs read as tabs, switches read on/off, close returns focus to the opener |
| context menus | opened with the menu key / shift+F10 / long press, items read, escape returns focus |
| drag and drop | the non-drag alternatives are discoverable and announce the result |

Display and input:

- focus order after opening and closing each panel and dialog
- 200% and 400% browser zoom, and a 320 px viewport (reflow is covered by e2e, reading order is not)
- Windows high-contrast / forced colors, and macOS "increase contrast"
- the `paper` look: contrast of muted text and borders (axe checks the default looks only)
- touch target size on a phone (WCAG 2.5.8, 24 px minimum)
