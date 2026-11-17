import AxeBuilder from "@axe-core/playwright";
import { dragBetween } from "../drag";
import type { Recipe, Step } from "../types";

const PALETTE_INPUT = '[data-slot="command-input"]';
const ITEM = '[data-slot="command-item"]';
const BAR = "role=contentinfo";
const SEEK = 'input[aria-label="Seek"]';
const ROWS = "tbody tr";

const pause = (ms: number): Step => ({ run: (c) => c.page.waitForTimeout(ms) });
const clear: Step[] = [{ key: "Meta+a" }, { key: "Backspace" }];
const palette: Step[] = [{ go: "/", ready: "text=made for you" }, { key: "Meta+K" }, { wait: PALETTE_INPUT }];
const album: Step[] = [{ go: "/album/{album}", ready: "role=row" }];

export const TOUR: Recipe[] = [
  // search
  {
    id: "cmdk-typos",
    shot: "S2",
    steps: [
      ...palette,
      { type: "ligths on" },
      pause(900),
      { shot: "typo", boxes: { input: PALETTE_INPUT } },
      ...clear,
      { type: "lightson" },
      pause(900),
      { shot: "no-spaces", boxes: { input: PALETTE_INPUT } },
      ...clear,
      { type: "halcyon static - echo static" },
      pause(900),
      { shot: "artist-title", boxes: { input: PALETTE_INPUT } },
    ],
  },
  {
    id: "cmdk-filters",
    steps: [
      ...palette,
      { type: "artist:halcyon year:2008..2015 format:mp3" },
      pause(900),
      { shot: "filters", boxes: { input: PALETTE_INPUT, row1: ITEM } },
      ...clear,
      { type: "is:liked" },
      pause(900),
      { shot: "is-liked", boxes: { row1: ITEM } },
    ],
  },
  {
    id: "cmdk-sonic",
    steps: [...palette, { type: "bpm:90..140 energy:high" }, pause(900), { shot: "sonic", boxes: { input: PALETTE_INPUT } }],
  },
  {
    id: "cmdk-commands",
    steps: [...palette, { shot: "commands", boxes: { input: PALETTE_INPUT, first: ITEM } }],
  },
  {
    id: "cmdk-menu",
    steps: [
      ...palette,
      { type: "echo" },
      pause(900),
      { click: `${ITEM} >> nth=1`, right: true },
      { wait: "role=menu" },
      { shot: "menu", boxes: { menu: "role=menu" } },
    ],
  },
  {
    id: "list-filter",
    steps: [
      ...album,
      { key: "Meta+f", name: "filter this list" },
      { wait: 'input[aria-label="filter this list"]' },
      { type: "silver" },
      pause(900),
      { shot: "filter", boxes: { input: 'input[aria-label="filter this list"]' } },
    ],
  },
  {
    id: "add-track",
    steps: [
      ...palette,
      { type: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      pause(900),
      { shot: "link", boxes: { input: PALETTE_INPUT, first: ITEM } },
    ],
  },
  // playback
  {
    id: "crossfade",
    shot: "S5",
    steps: [
      { go: "/settings", ready: "role=tab" },
      { click: 'role=tab[name="playback"]' },
      { shot: "off", boxes: { slider: 'role=slider[name="crossfade seconds"]' } },
      {
        run: async (c) => {
          const slider = c.page.locator('input[aria-label="crossfade seconds"], [aria-label="crossfade seconds"]').first();
          await slider.focus();
          for (let at = 0; at < 6; at += 1) {
            c.event("key", { key: "ArrowRight" });
            await c.page.keyboard.press("ArrowRight");
          }
        },
      },
      { shot: "six-seconds", boxes: { slider: 'role=slider[name="crossfade seconds"]' } },
    ],
  },
  { id: "format-badge", needs: ["playing"], steps: [{ shot: "badge", boxes: { badge: `${BAR} >> text=MP3 320`, bar: BAR } }] },
  {
    id: "offline-cache",
    needs: ["playing"],
    steps: [pause(2500), { shot: "precached", boxes: { precached: `${ROWS} >> nth=3`, bar: BAR } }],
  },
  {
    id: "player-bar",
    needs: ["playing"],
    steps: [{ shot: "bar", boxes: { bar: BAR, play: 'role=button[name="pause"]', next: 'role=button[name="next"]' } }],
  },
  {
    id: "tab-title",
    needs: ["playing"],
    steps: [
      {
        run: async (c) => {
          c.take.data = { title: await c.page.title() };
        },
      },
      { shot: "bar", boxes: { bar: BAR } },
    ],
  },
  { id: "seekbar", needs: ["playing"], steps: [{ key: "5", name: "jump to 50%" }, pause(500), { shot: "seek", boxes: { seek: SEEK } }] },
  { id: "jump", needs: ["playing"], steps: [{ key: "7", name: "jump to 70%" }, pause(500), { shot: "seventy", boxes: { seek: SEEK } }] },
  {
    id: "transport-keys",
    needs: ["playing"],
    steps: [{ key: "Space", name: "pause" }, pause(500), { shot: "paused", boxes: { bar: BAR } }],
  },
  {
    id: "shuffle",
    needs: ["playing"],
    steps: [
      { click: `${BAR} >> role=button[name="shuffle"]`, name: "shuffle" },
      { shot: "shuffle", boxes: { shuffle: `${BAR} >> role=button[name="shuffle"]` }, toasts: true },
    ],
  },
  {
    id: "sleep",
    needs: ["playing"],
    steps: [
      { click: 'role=button[name="more controls"]' },
      { click: 'role=menuitem[name="sleep timer"]', name: "sleep timer" },
      pause(500),
      { shot: "sleep", boxes: { menu: "role=menu" } },
    ],
  },
  {
    id: "like",
    needs: ["playing"],
    steps: [
      { key: "f", name: "like" },
      { shot: "liked", boxes: { heart: `${BAR} >> role=button[name^="unlike"]` }, toasts: true },
    ],
  },
  {
    id: "trims",
    needs: ["playing"],
    steps: [
      { key: "Alt+[", name: "start this song here" },
      { shot: "trim", toasts: true },
    ],
  },
  // queue and control
  {
    id: "play-next",
    steps: [
      ...album,
      { click: "role=row >> nth=4", right: true },
      { click: 'role=menuitem[name="play next"]', name: "play next" },
      { shot: "play-next", toasts: true },
    ],
  },
  {
    id: "queue-save",
    needs: ["playing"],
    steps: [
      { key: "q" },
      { click: 'role=button[name="save queue as playlist"]' },
      { wait: "role=dialog" },
      { shot: "save", boxes: { dialog: "role=dialog" } },
    ],
  },
  {
    id: "select",
    steps: [
      ...album,
      { run: (c) => c.page.locator(ROWS).first().focus() },
      { key: "j" },
      { key: "x", name: "select" },
      { key: "Shift+j", name: "extend selection" },
      { key: "Shift+j", name: "extend selection" },
      { shot: "selected", boxes: { rows: ROWS } },
    ],
  },
  {
    id: "list-keys",
    steps: [
      ...album,
      { run: (c) => c.page.locator(ROWS).first().focus() },
      { key: "j" },
      { key: "j" },
      { key: "j" },
      { shot: "focused", boxes: { rows: ROWS } },
    ],
  },
  {
    id: "dnd-playlist",
    shot: "S6",
    steps: [
      { go: "/", ready: "text=made for you" },
      { shot: "before", boxes: { folder: 'role=button[name^="folder Mix"]' } },
      {
        run: async (c) => {
          await c.page.goto(`${c.base}/album/${c.found.album}`);
          await c.page.getByRole("row").first().waitFor();
          await dragBetween(c, `${ROWS} >> nth=1`, 'role=link[name="Favorites"]', "drop");
        },
      },
      { shot: "dropped", toasts: true },
    ],
  },
  {
    id: "folders-new",
    shot: "S6",
    steps: [
      { go: "/", ready: "text=made for you" },
      { click: 'role=button[name="new folder"]', name: "new folder" },
      { wait: "role=dialog" },
      { type: "late night drive", into: "role=dialog >> role=textbox" },
      { shot: "dialog", boxes: { dialog: "role=dialog" } },
      { key: "Enter" },
      pause(900),
      { shot: "created", boxes: { folder: 'role=button[name^="folder late night drive"]' } },
    ],
  },
  // made for you
  {
    id: "mix-saved",
    steps: [
      { go: "/", ready: "text=made for you" },
      { shot: "sidebar", boxes: { mix1: 'role=link[name="daily mix 1"] >> nth=0', daylist: 'role=link[name="daylist"] >> nth=0' } },
    ],
  },
  {
    id: "mix-onthisday",
    steps: [
      { go: "/", ready: "text=made for you" },
      { wait: 'role=link[name="on this day"]' },
      { shot: "on-this-day", boxes: { tile: 'main >> role=link[name="on this day"]' } },
    ],
  },
  {
    id: "radio-tune",
    steps: [
      { go: "/artists", ready: 'a[href^="/artist/"]' },
      { click: 'a[href^="/artist/"]' },
      { click: 'main >> role=button[name="radio"]', name: "start radio" },
      { wait: "text=keeps adding more as it plays" },
      { shot: "preview", boxes: { header: "main >> text=keeps adding more as it plays" } },
      { freeze: 12 },
      { click: 'main >> role=button[name="play"]', name: "play" },
      pause(1200),
      { shot: "playing", boxes: { bar: BAR } },
    ],
  },
  {
    id: "release-get",
    steps: [
      { go: "/", ready: 'role=list[name="new releases"]' },
      { click: 'role=list[name="new releases"] >> role=button[name^="get"]', name: "get it" },
      pause(900),
      { shot: "asked", boxes: { row: 'role=list[name="new releases"]' } },
    ],
  },
  // intake
  {
    id: "recap",
    steps: [
      { go: "/stats", ready: "text=minutes" },
      { click: 'role=button[name="recap"]', name: "recap" },
      { wait: "role=dialog" },
      pause(900),
      { shot: "recap", boxes: { card: "role=dialog" } },
    ],
  },
  {
    id: "forgotten",
    steps: [{ go: "/stats", ready: "text=minutes" }, { reveal: "text=/forgotten/i" }, pause(500), { shot: "forgotten" }],
  },
  {
    id: "sticky",
    steps: [
      { go: "/songs", ready: ROWS },
      {
        run: async (c) => {
          await c.page.mouse.move(800, 400);
          await c.page.mouse.wheel(0, 1400);
          await c.page.waitForTimeout(300);
        },
      },
      { shot: "scrolled", boxes: { header: "main >> text=songs" } },
    ],
  },
  {
    id: "listen-party",
    steps: [{ go: "/listen", ready: "main" }, { click: "text=/party mode/i", name: "party mode" }, { shot: "party" }],
  },
  // keys
  {
    id: "rebind",
    shot: "S10",
    steps: [
      { go: "/", ready: "text=made for you" },
      { key: "?" },
      { wait: "role=dialog" },
      { click: 'role=button[name="change the key for play / pause"]', name: "rebind" },
      pause(500),
      { shot: "rebinding", boxes: { dialog: "role=dialog" } },
      { key: "x", name: "the new key" },
      pause(500),
      { shot: "rebound", boxes: { dialog: "role=dialog" } },
    ],
  },
  {
    id: "hints",
    needs: ["playing"],
    steps: [
      { hover: `${BAR} >> role=button[name="next"]` },
      pause(900),
      { shot: "tooltip", boxes: { next: `${BAR} >> role=button[name="next"]` } },
    ],
  },
  {
    id: "sidebar-toggle",
    steps: [{ go: "/", ready: "text=made for you" }, { key: "Meta+b", name: "hide the sidebar" }, pause(500), { shot: "hidden" }],
  },
  {
    id: "back-forward",
    steps: [
      { go: "/", ready: "text=made for you" },
      { click: 'role=link[name="albums"]' },
      { wait: 'a[href^="/album/"] img >> nth=5' },
      { click: 'role=button[name="back"]', name: "back" },
      pause(700),
      { shot: "back", boxes: { back: 'role=button[name="back"]', forward: 'role=button[name="forward"]' } },
    ],
  },
  // first run, states, health
  {
    id: "onboarding",
    anon: true,
    steps: [
      { go: "/", ready: 'role=button[name="sign in"]' },
      { shot: "login", boxes: { form: "main" } },
    ],
  },
  {
    id: "tour",
    steps: [
      {
        run: async (c) => {
          await c.page.addInitScript(() => {
            localStorage.removeItem("keep-player:onboarded");
            localStorage.setItem("keep-player:tips", "{}");
          });
        },
      },
      { go: "/", ready: "text=made for you" },
      pause(1200),
      { shot: "first-run" },
    ],
  },
  {
    id: "a11y",
    steps: [
      { go: "/", ready: "text=made for you" },
      {
        run: async (c) => {
          const pages: Record<string, number> = {};
          for (const route of ["/", "/albums", "/songs", "/stats", "/history"]) {
            await c.page.goto(`${c.base}${route}`);
            await c.page.waitForTimeout(1200);
            pages[route] = (await new AxeBuilder({ page: c.page }).analyze()).violations.length;
          }
          c.take.data = { axeViolations: pages };
        },
      },
      { go: "/", ready: "text=made for you" },
      { shot: "home" },
    ],
  },
  {
    id: "states",
    steps: [
      { go: "/moments", ready: "main" },
      { shot: "empty" },
      {
        run: async (c) => {
          await c.page.route("**/rest/getAlbum?*", (route) => route.abort());
          await c.page.goto(`${c.base}/album/${c.found.album}`);
          await c.page.waitForTimeout(2500);
        },
      },
      { shot: "error" },
    ],
  },
  {
    id: "loading",
    steps: [
      { go: "/artists", ready: 'a[href^="/artist/"]' },
      {
        run: async (c) => {
          await c.page.route("**/rest/getArtist?*", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            await route.continue();
          });
          await c.page.locator('a[href^="/artist/"]').first().click();
        },
      },
      { shot: "loading" },
    ],
  },
  {
    id: "rating",
    steps: [
      { go: "/settings", ready: "role=tab" },
      { click: 'role=tab[name="appearance"]' },
      { click: 'role=switch[name="show ratings"]', name: "show ratings" },
      pause(800),
      { key: "Escape" },
      { click: 'role=link[name="songs"]' },
      { wait: ROWS },
      pause(600),
      { shot: "stars", boxes: { rows: ROWS } },
    ],
  },
];
