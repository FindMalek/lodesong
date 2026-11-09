import { buildScore, type FilmSpec, type Score, type UiEvent, type UiKind } from "./audio-plan";
import { createClock, FPS, type Ritard, type Segment } from "./audio-tempo";
import { CUT_MAP, TEMPO, type Tempo } from "./design/beat";
import { CHAPTERS, type Chapter, chapterBeats, chapterRange, FEATURES, TOUR_MAP, TOUR_TEMPO } from "./features";

export type Film = "hero" | "tour" | "cutdown";
export const FILMS: readonly Film[] = ["hero", "tour", "cutdown"];

export interface AudioCue {
  id: string;
  frame: number;
  kind: string;
  label: string;
  film: Film;
  /** frames, for sounds that last (riser, swell, whoosh) */
  length?: number;
}

export interface SheetCue extends AudioCue {
  note?: number;
  gain: number;
  pan: number;
  style?: string;
}

type Row = readonly [id: string, beats: number, bpm: number, mood: string, enter?: Segment["enter"], extra?: Partial<Segment>];

const segments = (rows: readonly Row[]): Segment[] =>
  rows.map(([id, beats, bpm, mood, enter, extra]) => ({ id, beats, bpm, mood, enter: enter ?? "none", ...extra }));

type Part = readonly [id: string, beats: number, mood: string, enter?: Segment["enter"], extra?: Partial<Segment>];

/** The score reads the edit's own tempo table: one entry of parts per shot, whose beats must add up to the shot. */
function overTempo(table: readonly Tempo[], plan: readonly (readonly Part[])[]): Row[] {
  return plan.flatMap((parts, i) => {
    const shot = table[i];
    if (!shot || parts.reduce((sum, part) => sum + part[1], 0) !== shot.beats) throw new Error(`score plan does not fit tempo shot ${i}`);
    return parts.map(([id, beats, mood, enter, extra]): Row => [id, beats, shot.bpm, mood, enter, extra]);
  });
}

const HERO: readonly Row[] = overTempo(TEMPO, [
  [["cold open", 4, "void"]],
  [["find the line", 8, "tension", "cut"]],
  [["play from the line", 8, "drop", "drop"]],
  [["the lyrics", 12, "calm", "cut"]],
  [["the queue", 8, "groove", "hit", { db: -4 }]],
  [["mixes", 8, "groove", "cut", { variant: 1, db: -1 }]],
  [["ask for a mood", 8, "lift", "cut", { db: -6 }]],
  [["one session", 12, "peak", "drop", { db: 4 }]],
  [
    ["everywhere", 6, "peak", "hit", { variant: 1, db: 1 }],
    ["terminal", 6, "pocket", "cut"],
  ],
  [["the notch", 8, "calm", "cut", { db: -2 }]],
  [["keyboard storm", 12, "storm", "drop"]],
  [["yours", 12, "flash", "hit", { db: 3 }]],
  [
    ["docker run", 4, "hush", "cut", { gap: 8 }],
    ["land", 2, "land", "hit"],
    ["afterglow", 6, "afterglow"],
  ],
]);

const TOUR_MOODS: Record<Chapter, readonly [mood: string, enter: Segment["enter"], extra?: Partial<Segment>]> = {
  lyrics: ["drop", "none", { db: -4 }],
  search: ["groove", "cut"],
  playback: ["groove", "hit", { variant: 1, db: 2 }],
  queue: ["calm", "cut", { key: 1 }],
  foryou: ["lift", "hit", { key: 1 }],
  intake: ["groove", "cut", { key: 1, variant: 1 }],
  listening: ["calm", "cut", { key: 2 }],
  library: ["lift", "hit", { key: 2 }],
  everywhere: ["peak", "hit", { key: 2 }],
  keys: ["storm", "hit", { key: 3, db: 2 }],
  polish: ["groove", "cut", { key: 3, variant: 1 }],
  yours: ["flash", "hit", { key: 3, db: 3 }],
};

/** The tour's score table is the tour's own tempo table: one segment per chapter, then the finale's three parts. */
const TOUR: readonly Row[] = overTempo(TOUR_TEMPO, [
  ...CHAPTERS.map(({ id }): readonly Part[] => {
    const [mood, enter, extra] = TOUR_MOODS[id];
    return [[id, chapterBeats(id), mood, enter, extra]];
  }),
  [
    ["docker run", 4, "hush", "cut", { gap: 8 }],
    ["land", 2, "land", "hit"],
    ["afterglow", 6, "afterglow"],
  ],
]);

const TOUR_KIND: Partial<Record<Chapter, UiKind>> = { lyrics: "line", keys: "key", everywhere: "device" };

const TOUR_PINS: readonly Pin[] = FEATURES.map((feature): Pin => {
  const start = TOUR_MAP.beatAtFrame(chapterRange(feature.chapter)[0]);
  const kind: UiKind = TOUR_KIND[feature.chapter] ?? (feature.wow === "A" ? "tile" : feature.wow === "B" ? "row" : "chip");
  return [feature.chapter, TOUR_MAP.beatAtFrame(feature.tour[0]) - start, kind, `feature:${feature.id}`];
});

const TOUR_RUNS = CHAPTERS.map(({ id }) => [id, 0.15, 8, 3] as const);

const CUTDOWN: readonly Row[] = overTempo(CUT_MAP.table, [
  [["hook", 4, "tension", "none", { db: -10 }]],
  [["find and ignite", 8, "drop", "drop"]],
  [["mixes", 4, "groove", "hit", { db: -4 }]],
  [["handoff", 4, "lift", "cut", { db: -7 }]],
  [["flashes", 4, "storm", "drop", { db: 3 }]],
  [
    ["land", 2, "land", "hit"],
    ["afterglow", 4, "afterglow"],
  ],
]);

type Pin = readonly [id: string, beat: number, kind: UiKind, label?: string];

function manifest(
  rows: readonly Row[],
  pins: readonly Pin[],
  runs: readonly (readonly [id: string, from: number, count: number, step: number])[] = [],
): UiEvent[] {
  const table = segments(rows);
  const clock = createClock(table);
  const startOf = (id: string): number => clock.starts[table.findIndex((s) => s.id === id)] ?? 0;
  const out: UiEvent[] = [];
  for (const [id, beat, kind, label] of pins) out.push({ frame: clock.frame(startOf(id) + beat), kind, ...(label ? { label } : {}) });
  for (const [id, from, count, step] of runs) {
    const first = clock.frame(startOf(id) + from);
    for (let i = 0; i < count; i += 1) out.push({ frame: first + i * step, kind: "type", label: "typed" });
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/** Placeholder events at the storyboard's moments. The capture manifest replaces this: every {frame, kind} owns a sound. */
const HERO_UI: readonly Pin[] = [
  ["cold open", 0, "draw", "hairline draws"],
  ["find the line", 0.5, "key", "cmd-k"],
  ["find the line", 4.5, "draw", "match underline draws"],
  ["find the line", 5, "row", "result row 1"],
  ["find the line", 5.25, "row", "result row 2"],
  ["find the line", 5.5, "row", "result row 3"],
  ["find the line", 6.5, "key", "arrow down"],
  ["find the line", 7.5, "key", "enter"],
  ["play from the line", 0.5, "seek", "seek bar jumps"],
  ["play from the line", 1, "ignite", "cover ignites gold"],
  ["play from the line", 3, "chip", "label chip"],
  ["play from the line", 7.5, "seek", "match cut to the lyrics"],
  ["the lyrics", 0, "key", "shift f"],
  ["the lyrics", 1.5, "line", "lyric line 1"],
  ["the lyrics", 3, "line", "lyric line 2"],
  ["the lyrics", 4.25, "key", "nudge ]"],
  ["the lyrics", 4.5, "chip", "nudge toast"],
  ["the lyrics", 5.5, "line", "lyric line 3"],
  ["the lyrics", 7.5, "line", "lyric line 4"],
  ["the lyrics", 9, "line", "lyric line 5"],
  ["the lyrics", 10, "click", "click a line"],
  ["the lyrics", 10.1, "seek", "playback jumps"],
  ["the queue", 0, "key", "q"],
  ["the queue", 0.5, "row", "queue row 1"],
  ["the queue", 0.75, "row", "queue row 2"],
  ["the queue", 1, "row", "queue row 3"],
  ["the queue", 1.25, "row", "queue row 4"],
  ["the queue", 1.5, "row", "queue row 5"],
  ["the queue", 3, "key", "cmd-z"],
  ["the queue", 3.1, "row", "undo"],
  ["the queue", 5, "seek", "crossfade"],
  ["the queue", 7, "chip", "eq chip"],
  ["mixes", 0.5, "tile", "mix tile 1"],
  ["mixes", 1.5, "tile", "mix tile 2"],
  ["mixes", 2.5, "tile", "mix tile 3"],
  ["mixes", 3.5, "tile", "mix tile 4"],
  ["mixes", 4.5, "tile", "mix tile 5"],
  ["mixes", 5.5, "tile", "mix tile 6"],
  ["mixes", 7, "click", "open daily mix"],
  ["ask for a mood", 5.5, "enter", "enter"],
  ["ask for a mood", 6, "chip", "playlist lands"],
  ["one session", 1, "click", "devices"],
  ["one session", 1.5, "row", "picker row 1"],
  ["one session", 1.75, "row", "picker row 2"],
  ["one session", 3.25, "click", "select iphone"],
  ["one session", 4, "draw", "gold line draws"],
  ["one session", 6, "device", "pulse arrives"],
  ["one session", 8, "chip", "chip 1"],
  ["one session", 8.5, "chip", "chip 2"],
  ["one session", 9, "chip", "chip 3"],
  ["one session", 9.5, "chip", "chip 4"],
  ["one session", 10, "chip", "chip 5"],
  ["one session", 10.5, "chip", "chip 6"],
  ["everywhere", 2, "flash", "iphone"],
  ["everywhere", 4, "flash", "android"],
  ["everywhere", 6, "flash", "desktop"],
  ["terminal", 3, "enter", "terminal enter"],
  ["keyboard storm", 0, "key", "question mark"],
  ["keyboard storm", 2, "key", "g"],
  ["keyboard storm", 3, "key", "h"],
  ["keyboard storm", 4, "key", "g"],
  ["keyboard storm", 5, "key", "a"],
  ["keyboard storm", 6, "key", "b"],
  ["keyboard storm", 7, "key", "shift c"],
  ["yours", 0, "flash", "offline"],
  ["yours", 1.33, "flash", "upload"],
  ["yours", 2.67, "flash", "doctor"],
  ["yours", 4, "flash", "share"],
  ["yours", 5.33, "flash", "light theme"],
  ["yours", 6.67, "flash", "speed"],
  ["docker run", 3.5, "enter", "docker run enter"],
  ["land", 1, "draw", "wordmark draws"],
];

const HERO_RUNS = [
  ["find the line", 1, 9, 3],
  ["ask for a mood", 2, 28, 3],
  ["terminal", 0.5, 15, 3],
  ["docker run", 0.3, 34, 2],
] as const;

function generated(rows: readonly Row[]): readonly Pin[] {
  const table = segments(rows);
  const pins: Pin[] = [];
  for (const s of table) {
    if (s.mood === "afterglow" || s.mood === "void") continue;
    const n = Math.floor(s.beats / 2);
    for (let i = 0; i < n; i += 1) {
      const kind: UiKind[] = ["key", "row", "tile", "click", "chip", "line"];
      pins.push([s.id, 0.5 + i * 2 + (i % 2) * 0.25, kind[(i + s.beats) % kind.length] as UiKind, `${s.id} ${i + 1}`]);
    }
  }
  return pins;
}

interface Def {
  rows: readonly Row[];
  pins: readonly Pin[];
  runs?: readonly (readonly [string, number, number, number])[];
  /** the ritardando lands on the first beat of this segment */
  final: string;
  over: number;
  slow: number;
  finalGap: number;
}

const DEFS: Record<Film, Def> = {
  hero: { rows: HERO, pins: HERO_UI, runs: HERO_RUNS, final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
  tour: { rows: TOUR, pins: TOUR_PINS, runs: TOUR_RUNS, final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
  cutdown: { rows: CUTDOWN, pins: generated(CUTDOWN), runs: [["hook", 1, 9, 3]], final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
};

function specOf(film: Film): FilmSpec {
  const def = DEFS[film];
  const table = segments(def.rows);
  const base = createClock(table);
  const final = base.starts[table.findIndex((s) => s.id === def.final)] ?? base.totalBeats;
  const ritard: Ritard = { final, over: def.over, slow: def.slow };
  return { id: film, segments: table, ritard, ui: manifest(def.rows, def.pins, def.runs), finalGap: def.finalGap };
}

export const SPECS: Record<Film, FilmSpec> = { hero: specOf("hero"), tour: specOf("tour"), cutdown: specOf("cutdown") };
export const SCORES: Record<Film, Score> = {
  hero: buildScore(SPECS.hero),
  tour: buildScore(SPECS.tour),
  cutdown: buildScore(SPECS.cutdown),
};

export const FILM_FRAMES: Record<Film, number> = {
  hero: SCORES.hero.clock.totalFrames,
  tour: SCORES.tour.clock.totalFrames,
  cutdown: SCORES.cutdown.clock.totalFrames,
};

export const SECTIONS: Record<Film, readonly { id: string; from: number; to: number }[]> = {
  hero: sectionsOf("hero"),
  tour: sectionsOf("tour"),
  cutdown: sectionsOf("cutdown"),
};

function sectionsOf(film: Film): { id: string; from: number; to: number }[] {
  const { clock } = SCORES[film];
  return clock.segments.map((s, i) => ({ id: s.id, from: clock.starts[i] ?? 0, to: (clock.starts[i] ?? 0) + s.beats }));
}

const SHEETED = new Set(["kick", "snare", "impact", "riser", "whoosh", "reverse", "down", "ui"]);

function sheetOf(film: Film): SheetCue[] {
  const seen = new Map<string, number>();
  return SCORES[film].events
    .filter((e) => e.label && SHEETED.has(e.track) && !(e.track === "kick" && e.vel < 0.8))
    .map((e): SheetCue => {
      const frame = Math.round(e.t * FPS);
      const kind = e.track === "ui" ? (e.style ?? "ui") : e.track;
      const base = `${film}-${kind}-${frame}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return {
        id: count === 0 ? base : `${base}-${count}`,
        frame,
        kind,
        label: e.label as string,
        film,
        gain: e.vel,
        pan: e.pan,
        note: e.midi,
        ...(e.track === "ui" ? { style: e.style === "type" ? "typed" : e.style } : e.style ? { style: e.style } : {}),
        ...(["riser", "whoosh", "reverse", "down"].includes(e.track) ? { length: Math.round(e.dur * FPS) } : {}),
      };
    });
}

/** Everything the score plays that the picture can touch, with frames at 60 fps. The audio script renders the same events. */
export const SHEET: readonly SheetCue[] = FILMS.flatMap(sheetOf).sort((a, b) => a.frame - b.frame);

export const AUDIO_CUES: readonly AudioCue[] = SHEET.map(({ id, frame, kind, label, film, length }) => ({
  id,
  frame,
  kind,
  label,
  film,
  ...(length === undefined ? {} : { length }),
}));

/** Named frames the picture can land on: segment starts, the breath, the final hit. */
export const LANDMARKS: Record<Film, readonly { id: string; frame: number }[]> = {
  hero: SCORES.hero.landmarks,
  tour: SCORES.tour.landmarks,
  cutdown: SCORES.cutdown.landmarks,
};
