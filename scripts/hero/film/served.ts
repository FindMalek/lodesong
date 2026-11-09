import { CAPTURES } from "./coverage";
import type { Manifest, Served } from "./types";

/** Captures an existing recipe already serves, when the recipe is not named after the capture. */
const SERVED_BY: Record<string, Served> = {
  "lyrics-click": { recipe: "lyrics-full", plate: "click-line" },
  "cmdk-type": { recipe: "find-the-line", plate: "results" },
  eq: { recipe: "equalizer", plate: "eq" },
  "audio-settings": { recipe: "settings-playback" },
  quality: { recipe: "settings-playback" },
  "output-device": { recipe: "more-controls", plate: "menu" },
  "info-panel": { recipe: "song-info", plate: "info" },
  "queue-drag": { recipe: "queue", plate: "drag-drop" },
  undo: { recipe: "queue", plate: "undo" },
  "context-menu": { recipe: "share-link", plate: "menu" },
  "song-rules": { recipe: "share-link", plate: "menu" },
  "radio-preview": { recipe: "radio-tune" },
  "follow-pin": { recipe: "following", plate: "following" },
  import: { recipe: "import-spotify" },
  "import-state": { recipe: "import-spotify" },
  "stats-clock": { recipe: "stats" },
  "stats-top": { recipe: "stats" },
  "recap-card": { recipe: "recap" },
  moment: { recipe: "moments-save", plate: "saved" },
  "moment-reel": { recipe: "moments-save", plate: "moments" },
  "moment-link": { recipe: "copy-link", plate: "toast" },
  "album-types": { recipe: "artist-page" },
  "appears-on": { recipe: "artist-page" },
  "genre-page": { recipe: "genres" },
  "songs-sort": { recipe: "songs" },
  "aura-backdrop": { recipe: "lyrics-full", plate: "line-02" },
  themes: { recipe: "settings-appearance" },
  notifications: { recipe: "settings-appearance" },
  "covers-cache": { recipe: "albums" },
  handoff: { recipe: "devices", plate: "handed-off" },
  tokens: { recipe: "settings-sync" },
  "desktop-frame": { recipe: "home-mixes", plate: "home" },
  install: { recipe: "settings-about" },
  "cheat-sheet": { recipe: "shortcuts-sheet", plate: "sheet" },
  tooltip: { recipe: "hints" },
  settings: { recipe: "settings-playback" },
  storage: { recipe: "settings-storage" },
  "offline-mark": { recipe: "keep-offline" },
  "api-token": { recipe: "settings-sync" },
  update: { recipe: "settings-about" },
  listen: { recipe: "listen-together" },
  "phone-player": { recipe: "phone-player" },
  skeleton: { recipe: "loading" },
  states: { recipe: "states" },
};

/** What the real UI or the mock cannot show, so there is nothing to capture. */
export const UNCAPTURABLE: Record<string, string> = {
  "mix-radar": "release radar needs songs added in the last month; the mock library is dated January",
  "mix-moods": "focus, late night and energy mixes need Groq to cluster artists; the mock Groq only answers playlist prompts",
  "mix-weekly": "weekly playlists need Groq plus Sonaraem; neither is in the mock stack",
  transitions: "a view transition lasts a few frames and the settled screenshot never shows one",
  feedback: "the feedback dialog only exists when the server has a GitHub token",
  "aura-export": "no aura png export in the item menus the mock library exposes",
};

/** Fills the manifest's capture table from what was actually captured, and says which features have no plate. */
export function coverage(manifest: Manifest): { have: number; total: number; features: number; featureTotal: number; missing: string[] } {
  manifest.captures = {};
  manifest.uncapturable = UNCAPTURABLE;
  const missing: string[] = [];
  let have = 0;
  let features = 0;
  for (const [capture, ids] of Object.entries(CAPTURES)) {
    if (capture in UNCAPTURABLE) continue;
    const served = SERVED_BY[capture] ?? { recipe: capture };
    const take = manifest.features[served.recipe];
    const ok = take && (!served.plate || take.plates.some((plate) => plate.name === served.plate) || take.video);
    if (!ok) {
      missing.push(capture);
      continue;
    }
    manifest.captures[capture] = { ...served, features: ids };
    have += 1;
    features += ids.length;
  }
  const captureTotal = Object.keys(CAPTURES).length - Object.keys(UNCAPTURABLE).length;
  const featureTotal = Object.entries(CAPTURES)
    .filter(([capture]) => !(capture in UNCAPTURABLE))
    .reduce((sum, [, ids]) => sum + ids.length, 0);
  return { have, total: captureTotal, features, featureTotal, missing };
}
