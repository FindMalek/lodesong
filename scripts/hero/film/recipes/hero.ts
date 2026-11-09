import type { Page } from "@playwright/test";
import { dragRows } from "../drag";
import type { Recipe } from "../types";

const phones = new Map<string, Page>();

const PALETTE_INPUT = '[data-slot="command-input"]';
const LYRIC_HIT = '[data-slot="command-item"][data-value^="ly-"]';
const LINE = 'button[title$="click to play from here"]';
const SEEK = 'input[aria-label="Seek"]';
const BAR = "role=contentinfo";

export const HERO: Recipe[] = [
  {
    id: "find-the-line",
    shot: "S2",
    steps: [
      { go: "/album/{album}", ready: "role=row" },
      { shot: "album", boxes: { search: 'role=button[name="search"]', cover: "main img >> nth=1" } },
      { key: "Meta+K", name: "palette" },
      { wait: PALETTE_INPUT },
      { shot: "palette-empty", boxes: { input: PALETTE_INPUT } },
      { type: "lights on", each: true },
      { wait: LYRIC_HIT },
      { reveal: LYRIC_HIT },
      { shot: "results", boxes: { input: PALETTE_INPUT, row1: LYRIC_HIT, mark: `${LYRIC_HIT} mark` } },
    ],
  },
  {
    id: "play-from-line",
    shot: "S3",
    steps: [
      { go: "/album/{album}", ready: "role=row" },
      { freeze: 74 },
      { key: "Meta+K" },
      { wait: PALETTE_INPUT },
      { type: "lights on" },
      { wait: LYRIC_HIT },
      { reveal: LYRIC_HIT },
      { shot: "before", boxes: { row1: LYRIC_HIT } },
      { click: LYRIC_HIT, name: "play from the line" },
      { wait: 'role=contentinfo >> role=button[name="pause"]' },
      { shot: "after", boxes: { seek: SEEK, bar: BAR } },
    ],
  },
  {
    id: "lyrics-full",
    shot: "S4",
    needs: ["playing"],
    steps: [
      { key: "Shift+F", name: "full-screen lyrics" },
      { wait: `${LINE} >> nth=9` },
      { freeze: "line:2" },
      { click: `${LINE} >> nth=2`, name: "line" },
      { shot: "line-02", boxes: { active: `${LINE} >> nth=2`, cover: "img" } },
      {
        run: async (c) => {
          const line = 4;
          await c.freeze(c.starts[line] ?? 0);
          await c.page.locator(LINE).nth(line).click();
          for (const [at, word] of (c.lyrics.lines[line]?.words ?? []).entries()) {
            await c.freeze(word.start / 1000 + 0.05);
            c.event("word", { name: word.text });
            await c.shot(`word-${String(line).padStart(2, "0")}-${at}`, { active: `${LINE} >> nth=${line}` });
          }
        },
      },
      { freeze: "line:7" },
      { click: `${LINE} >> nth=7`, name: "line" },
      { shot: "click-line", boxes: { active: `${LINE} >> nth=7` } },
    ],
  },
  {
    id: "lyrics-nudge",
    shot: "S4",
    needs: ["playing"],
    steps: [
      { key: "y", name: "lyrics panel" },
      { wait: "text=timing" },
      { shot: "before", boxes: { footer: "footer >> text=timing" } },
      { key: "]", name: "nudge later" },
      { shot: "after", boxes: { footer: "footer >> text=timing" } },
    ],
  },
  {
    id: "queue",
    shot: "S5",
    needs: ["playing"],
    steps: [
      { key: "q", name: "queue" },
      { wait: "text=now playing" },
      { shot: "queue", boxes: { panel: 'aside[aria-label="queue"]' } },
      { run: (c) => dragRows(c, 'aside[aria-label="queue"] [draggable="true"]', 5, 1, "drag") },
      { key: "Meta+z", name: "undo" },
      { shot: "undo" },
    ],
  },
  {
    id: "home-mixes",
    shot: "S6",
    steps: [
      { go: "/", ready: "text=made for you" },
      { wait: 'role=link[name="daylist"]' },
      {
        shot: "home",
        boxes: Object.fromEntries(
          ["daily mix 1", "daily mix 2", "daily mix 3", "daily mix 4", "daily mix 5", "discover weekly", "daylist"].map((name) => [
            name,
            `main >> role=link[name="${name}"]`,
          ]),
        ),
      },
      { click: 'main >> role=link[name="daily mix 1"]', name: "open daily mix 1" },
      { wait: "role=row" },
      { shot: "mix" },
    ],
  },
  {
    id: "mood-search",
    shot: "S7",
    steps: [
      { go: "/", ready: "text=made for you" },
      { key: "Meta+K" },
      { wait: PALETTE_INPUT },
      { type: "gym", each: true },
      { shot: "results", boxes: { input: PALETTE_INPUT } },
    ],
  },
  {
    id: "stats",
    shot: "S7",
    steps: [{ go: "/stats", ready: "text=minutes" }, { shot: "stats" }],
  },
  {
    id: "devices",
    shot: "S8",
    needs: ["playing"],
    steps: [
      {
        run: async (c) => {
          const phone = await c.phone();
          phones.set(c.take.id, phone);
          await phone.waitForTimeout(500);
          await c.shot("phone-before", { bar: "role=contentinfo" }, false, phone);
        },
      },
      { key: "q" },
      { click: 'role=button[name="devices"]', name: "devices" },
      { wait: "text=play on" },
      { shot: "picker", boxes: { devices: 'role=button[name="devices"]', iphone: "text=safari on iphone" } },
      { click: "text=safari on iphone", name: "play on iphone" },
      { run: (c) => c.page.waitForTimeout(1500) },
      { shot: "handed-off", boxes: { bar: BAR } },
      {
        run: async (c) => {
          const phone = phones.get(c.take.id);
          if (!phone) return;
          await phone.waitForTimeout(1500);
          c.event("device", { name: "the phone takes over" });
          await c.shot("phone-after", { bar: "role=contentinfo", seek: 'input[aria-label="Seek"]' }, false, phone);
        },
      },
    ],
  },
];
