import { expect, test } from "bun:test";
import { AUDIO_CUES, SECTIONS } from "../audio-cues";
import { beat, FPS } from "../design/beat";
import { holdSeconds } from "./open-timeline";
import { CUT_SHOTS, END, frames, HERO_SHOTS, KEYS, MIXES, OPEN, SESSION, starts, TERMINAL } from "./timelines";

interface Item {
  id: string;
  words: number;
  from: number;
  to: number;
}

const ITEMS: Item[] = [
  { id: "mixes caption", words: 5, from: MIXES.caption + 1, to: MIXES.end },
  { id: "session caption", words: 4, from: SESSION.wide.caption + 1, to: SESSION.wide.end },
  { id: "session caption tall", words: 4, from: SESSION.tall.caption + 1, to: SESSION.tall.end },
  { id: "session chips", words: 2, from: SESSION.wide.chips + 0.25, to: SESSION.wide.end },
  { id: "keys query", words: 2, from: KEYS.type + 1, to: KEYS.cut },
  { id: "keys caption", words: 2, from: KEYS.caption + 1, to: KEYS.end },
  { id: "terminal caption", words: 5, from: TERMINAL.caption + 1, to: TERMINAL.end },
  { id: "terminal first song", words: 2, from: 0.5, to: TERMINAL.enter },
  { id: "terminal second song", words: 3, from: TERMINAL.enter + 1, to: TERMINAL.end },
  { id: "end tagline", words: 4, from: END.wide.tagline + 0.75, to: END.wide.end },
  { id: "end install", words: 4, from: END.wide.lines + 1, to: END.wide.end },
  { id: "end url", words: 1, from: END.wide.url + 0.25, to: END.wide.end },
  { id: "end tagline tall", words: 4, from: END.tall.tagline + 0.75, to: END.tall.end },
  { id: "end url tall", words: 1, from: END.tall.url + 0.25, to: END.tall.end },
  { id: "tall your music", words: 2, from: OPEN.tall.music + 1, to: OPEN.tall.headlineOut },
  { id: "tall your server", words: 2, from: OPEN.tall.server + 1, to: OPEN.tall.headlineOut },
  { id: "tall label", words: 3, from: OPEN.tall.label + 0.5, to: OPEN.tall.headlineOut },
  { id: "tall lyric line", words: 4, from: OPEN.tall.press + 1, to: OPEN.tall.end },
];

const onQuarter = (at: number): boolean => Number.isInteger(at * 4);

test("shots tile 60 beats for the hero and 30 for the cutdown", () => {
  expect(frames(HERO_SHOTS)).toBe(beat(60));
  expect(frames(CUT_SHOTS)).toBe(beat(30));
});

test("every text item holds 0.5 s plus 0.3 s per word fully visible", () => {
  const short = ITEMS.filter((item) => (beat(item.to) - beat(item.from)) / FPS < holdSeconds(item.words) - 0.001);
  expect(short.map((item) => item.id)).toEqual([]);
});

test("every event sits on the quarter-beat grid and inside its shot", () => {
  const tables = [OPEN.tall, MIXES, SESSION.wide, SESSION.tall, KEYS, TERMINAL, END.wide, END.tall];
  const values = tables.flatMap((table) => Object.values(table).flat());
  expect(values.filter((at) => typeof at === "number" && !onQuarter(at))).toEqual([]);
});

test("UI hits land on odd beats", () => {
  const hits = [
    OPEN.tall.press,
    OPEN.tall.ignite,
    OPEN.tall.advance,
    KEYS.chord,
    KEYS.enter,
    KEYS.sheet,
    SESSION.wide.picker,
    SESSION.wide.select,
    SESSION.tall.select,
    TERMINAL.enter,
    MIXES.ignite,
  ];
  expect(hits.filter((at) => !(Number.isInteger(at) && at % 2 === 1))).toEqual([]);
});

test("shots cut on the score's own sections", () => {
  const cut = starts(HERO_SHOTS);
  const bounds = SECTIONS.hero.map((section) => beat(section.from));
  for (const id of ["keys", "mixes", "session", "terminal", "end"]) expect(bounds).toContain(cut[id] ?? -1);
  const strip = starts(CUT_SHOTS);
  expect(SECTIONS.cutdown.map((section) => beat(section.from))).toContain(strip.session ?? -1);
});

test("the hero cuts land on a sound", () => {
  const cut = starts(HERO_SHOTS);
  const sounded = new Set(AUDIO_CUES.filter((cue) => cue.film === "hero").map((cue) => cue.frame));
  for (const id of ["keys", "mixes", "session", "terminal"]) expect(sounded.has(cut[id] ?? -1)).toBe(true);
});
