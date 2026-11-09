import type { Recipe, Step } from "../types";

/** A page that is just a route and something to wait for. */
const page = (id: string, path: string, ready: string, shot = "tour", extra: Step[] = []): Recipe => ({
  id,
  shot,
  steps: [{ go: path, ready }, ...extra, { shot: id }],
});

const SETTINGS = ["playback", "appearance", "library", "sync", "storage", "lyrics", "shortcuts", "account", "about"];

export const LIBRARY: Recipe[] = [
  page("albums", "/albums", 'a[href^="/album/"] img >> nth=20'),
  page("artists", "/artists", 'a[href^="/artist/"]'),
  page("songs", "/songs", "role=row >> nth=10"),
  page("genres", "/genres", 'a[href^="/genre/"]'),
  page("liked", "/liked", "main"),
  page("history", "/history", "main >> text=history"),
  page("folders", "/folders", "main"),
  page("lyrics-coverage", "/lyrics", "main"),
  page("import-spotify", "/import", "main"),
  page("listen-together", "/listen", "main"),
  {
    id: "doctor",
    shot: "tour",
    steps: [
      { go: "/doctor", ready: "text=library health" },
      { shot: "doctor", boxes: { health: "text=library health" } },
      {
        run: async (c) => {
          await c.page.evaluate(() =>
            fetch(`/rest/createPlaylist?name=${encodeURIComponent("⇪ Upgrade")}&f=json`, { headers: { "x-lodesong": "1" } }),
          );
          await c.page.goto(`${c.base}/doctor`);
        },
      },
      { click: "role=button[name=/^fix .* with lyterion$/]", name: "fix with lyterion" },
      { wait: "text=/sent to lyterion to fix/" },
      { shot: "fixed", boxes: { fix: "text=/sent to lyterion to fix/" }, toasts: true },
    ],
  },
  {
    id: "upload",
    shot: "S11",
    steps: [
      { go: "/upload", ready: "main" },
      { shot: "empty", boxes: { drop: "main >> text=drop songs" } },
      {
        run: async (c) => {
          const file = (name: string) => ({ name, mimeType: "audio/mpeg", buffer: Buffer.alloc(24_000, 1) });
          c.event("drop", { name: "an album folder" });
          await c.page.setInputFiles("input[type=file]", [file("01 Low Tide.mp3"), file("02 Afterglow.mp3"), file("03 Paper Moons.mp3")]);
          await c.page.waitForTimeout(2500);
        },
      },
      { shot: "dropped" },
    ],
  },
  ...SETTINGS.map(
    (tab): Recipe => ({
      id: `settings-${tab}`,
      steps: [{ go: "/settings", ready: "role=tab" }, { click: `role=tab[name="${tab}"]` }, { shot: `settings-${tab}` }],
    }),
  ),
  {
    id: "artist-page",
    steps: [
      { go: "/artists", ready: 'a[href^="/artist/"]' },
      { click: 'a[href^="/artist/"]' },
      { wait: 'a[href^="/album/"] img' },
      { shot: "artist" },
    ],
  },
  {
    id: "shortcuts-sheet",
    shot: "S10",
    steps: [
      { go: "/", ready: "text=made for you" },
      { key: "?", name: "shortcuts" },
      { wait: "role=dialog" },
      { shot: "sheet", boxes: { dialog: "role=dialog" } },
    ],
  },
  {
    id: "chords",
    shot: "S10",
    steps: [
      { go: "/", ready: "text=made for you" },
      { key: "g" },
      { key: "a", name: "go to albums" },
      { wait: 'a[href^="/album/"] img >> nth=5' },
      { shot: "albums" },
      { key: "g" },
      { key: "r", name: "go to artists" },
      { wait: 'a[href^="/artist/"]' },
      { shot: "artists" },
      { key: "g" },
      { key: "t", name: "go to stats" },
      { wait: "text=minutes" },
      { shot: "stats" },
    ],
  },
  {
    id: "theme-light",
    shot: "S11",
    theme: "light",
    steps: [{ go: "/", ready: "text=made for you" }, { shot: "home" }],
  },
  {
    id: "lyrics-light",
    shot: "S11",
    theme: "light",
    needs: ["playing"],
    steps: [{ key: "Shift+F" }, { wait: 'button[title$="click to play from here"] >> nth=5' }, { shot: "lyrics" }],
  },
];
