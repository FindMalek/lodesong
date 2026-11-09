import type { Ctx, Recipe } from "../types";
import { recordVideo } from "../video";

const LINE = 'button[title$="click to play from here"]';
const BAR = "role=contentinfo";
const TOAST = "[data-sonner-toast]";

/** A wheel turn over the list, so whatever element scrolls it does; the settle step parks the pointer elsewhere. */
async function wheel(c: Ctx, delta: number): Promise<void> {
  await c.page.mouse.move(800, 400);
  await c.page.mouse.wheel(0, delta);
  await c.page.waitForTimeout(120);
}

export const FEATURES: Recipe[] = [
  {
    id: "ai-prompt",
    shot: "S7",
    steps: [
      { go: "/", ready: "text=made for you" },
      { key: "Shift+N", name: "new playlist" },
      { wait: "role=dialog" },
      { shot: "dialog", boxes: { dialog: "role=dialog" } },
      { type: "late night drive, 90s, no vocals", into: 'role=dialog >> role=textbox[name="describe it"]' },
      { shot: "typed", boxes: { dialog: "role=dialog" } },
      { click: 'role=dialog >> role=button[name="make it"]', name: "make it" },
      { wait: "text=/^12 of your songs/" },
      { shot: "made", boxes: { dialog: "role=dialog" } },
      { click: 'role=dialog >> role=button[name="create"]', name: "create" },
      { wait: "role=row" },
      { shot: "playlist" },
    ],
  },
  {
    id: "moments-save",
    shot: "S10",
    needs: ["playing"],
    steps: [
      { freeze: 20 },
      { key: "b", name: "save a moment", at: 'input[aria-label="Seek"]' },
      { shot: "saved", boxes: { seek: 'input[aria-label="Seek"]', toast: TOAST }, toasts: true },
      { freeze: 70 },
      { key: "b", name: "save a moment" },
      { go: "/moments", ready: "main" },
      { shot: "moments" },
    ],
  },
  {
    id: "copy-link",
    shot: "S10",
    needs: ["playing"],
    steps: [
      { key: "Shift+C", name: "copy a link to this point" },
      { shot: "toast", boxes: { toast: TOAST }, toasts: true },
    ],
  },
  {
    id: "stop-after",
    shot: "S5",
    needs: ["playing"],
    steps: [
      { key: "Shift+S", name: "stop after this song" },
      { shot: "toast", boxes: { toast: TOAST }, toasts: true },
    ],
  },
  {
    id: "song-info",
    needs: ["playing"],
    steps: [{ key: "i" }, { wait: "aside" }, { shot: "info" }],
  },
  {
    id: "more-controls",
    shot: "S5",
    needs: ["playing"],
    steps: [{ click: 'role=button[name="more controls"]' }, { wait: "role=menu" }, { shot: "menu", boxes: { menu: "role=menu" } }],
  },
  {
    id: "equalizer",
    shot: "S5",
    steps: [
      { go: "/settings", ready: "role=tab" },
      { click: 'role=tab[name="playback"]' },
      { click: 'role=button[name="adjust"]' },
      { wait: "role=slider >> nth=5" },
      { shot: "eq", boxes: { sliders: "role=slider >> nth=0" } },
    ],
  },
  {
    id: "share-link",
    shot: "S11",
    steps: [
      { go: "/album/{album}", ready: "role=row" },
      { click: "role=row >> nth=2", right: true, name: "context menu" },
      { wait: "role=menu" },
      { shot: "menu", boxes: { menu: "role=menu" } },
    ],
  },
  {
    id: "offline",
    shot: "S11",
    needs: ["playing"],
    steps: [
      { run: (c) => c.page.waitForTimeout(2500) },
      {
        run: async (c) => {
          await c.page.context().setOffline(true);
          c.event("offline");
        },
      },
      { key: "Shift+ArrowRight", name: "seek while offline" },
      { shot: "offline", boxes: { bar: BAR } },
    ],
  },
  {
    id: "keep-offline",
    shot: "S11",
    steps: [
      { go: "/album/{album}", ready: "role=row" },
      { click: 'role=button[name="keep offline"]' },
      { shot: "album", boxes: { button: 'role=button[name="keep offline"]' } },
    ],
  },
  {
    id: "phone-home",
    shot: "S9",
    device: "phone",
    steps: [{ go: "/", ready: "text=made for you" }, { shot: "home" }],
  },
  {
    id: "phone-player",
    shot: "S8",
    device: "phone",
    needs: ["playing"],
    steps: [
      { shot: "album", boxes: { bar: BAR } },
      { click: 'role=button[name="queue"]' },
      { wait: "text=now playing" },
      { shot: "queue" },
    ],
  },
  {
    id: "phone-lyrics",
    shot: "S9",
    device: "phone",
    needs: ["playing"],
    steps: [{ key: "Shift+F" }, { wait: `${LINE} >> nth=5` }, { shot: "lyrics" }],
  },
  {
    id: "scroll-10k",
    shot: "S11",
    stack: "long",
    steps: [
      { go: "/songs", ready: "role=row >> nth=10" },
      { shot: "top", boxes: { rows: "role=row >> nth=1" } },
      {
        run: (c) =>
          recordVideo(c, "scroll", 90, async (index) => {
            await wheel(c, 60 + index * 14);
          }),
      },
    ],
  },
  {
    id: "following",
    shot: "S11",
    steps: [
      {
        run: async (c) => {
          const artists: string[] = await c.page.evaluate(async () => {
            const index = (await (await fetch("/rest/getArtists?f=json", { headers: { "x-lodesong": "1" } })).json())["subsonic-response"]
              .artists.index;
            return index
              .flatMap((g: { artist: { name: string }[] }) => g.artist)
              .slice(0, 4)
              .map((a: { name: string }) => a.name);
          });
          for (const name of artists)
            await c.page.evaluate(
              (artist) =>
                fetch("/api/follows", {
                  method: "PUT",
                  headers: { "x-lodesong": "1", "content-type": "application/json" },
                  body: JSON.stringify({ name: artist, status: "pinned" }),
                }),
              name,
            );
        },
      },
      { go: "/following", ready: "main" },
      { wait: 'role=list[name="followed artists"]' },
      { shot: "following" },
      { go: "/", ready: 'role=list[name="new releases"]' },
      { shot: "releases", boxes: { row: 'role=list[name="new releases"]' } },
    ],
  },
];
