import { expect, test } from "bun:test";
import { gridBeat as beat, FPS } from "../design/beat";
import { END, frames, KEYS, LEGACY_CUT_SHOTS, LEGACY_HERO_SHOTS, MIXES, OPEN, SESSION, TERMINAL } from "./legacy-timelines";
import { holdSeconds } from "./open-timeline";

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
  { id: "terminal second song", words: 3, from: TERMINAL.enter + 1, to: TERMINAL.pause },
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
  expect(frames(LEGACY_HERO_SHOTS)).toBe(beat(60));
  expect(frames(LEGACY_CUT_SHOTS)).toBe(beat(30));
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
