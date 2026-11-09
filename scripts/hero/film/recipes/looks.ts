import type { Recipe } from "../types";

const ALBUM = 'a[href^="/album/"] img';

const look = (name: string, theme: "dark" | "light"): Recipe => ({
  id: `look-${name}`,
  shot: "S11",
  theme,
  steps: [
    { go: "/settings", ready: "role=tab" },
    { click: 'role=tab[name="appearance"]' },
    { shot: "before", boxes: { look: 'role=button[name="lodesong"]', picked: `role=button[name="${name}"]`, code: "text=theme code" } },
    { click: `role=button[name="${name}"]`, name: `look ${name}` },
    { shot: "panel", boxes: { picked: `role=button[name="${name}"]` } },
    { click: 'role=button[name="save look"]', name: "save look" },
    { wait: "text=/^saved,/" },
    { key: "Escape", name: "close settings" },
    { wait: `${ALBUM} >> nth=3` },
    { shot: "home" },
    { click: 'role=link[name="albums"]', name: "albums" },
    { wait: `${ALBUM} >> nth=5` },
    { shot: "albums" },
  ],
});

/** The same screens under the built-in looks: the app's own theme presets, applied through its appearance settings. */
export const LOOKS: Recipe[] = [look("paper", "light"), look("slate", "dark"), look("terminal", "dark"), look("soft", "light")];
