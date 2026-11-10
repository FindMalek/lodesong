import cutCues from "./audio-cut-cues.json";
import { buildScore, type FilmSpec, type Score, type UiEvent, type UiKind } from "./audio-plan";
import shotCues from "./audio-shot-cues.json";
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
  [["cold open", 6, "void", "none", { ignite: 1.5 }]],
  [["find the line", 8, "tension", "cut"]],
  [["play from the line", 8, "drop", "drop"]],
  [["the lyrics", 8, "calm", "cut"]],
  [["bring it over", 4, "calm", "cut", { db: 1 }]],
  [["the queue", 8, "groove", "hit", { db: -4 }]],
  [["mixes", 8, "groove", "cut", { variant: 1, db: -1 }]],
  [["ask for a mood", 8, "lift", "cut", { db: -6 }]],
  [["one session", 8, "peak", "drop", { db: 4 }]],
  [
    ["everywhere", 4, "peak", "hit", { variant: 1, db: 3, hb: 2 }],
    ["desktop", 1.5, "peak", "none", { variant: 1, db: 3, hb: 1.5 }],
    ["terminal", 2.5, "strip", "none", { db: 1 }],
  ],
  [["the notch", 8, "breather", "cut"]],
  [["keyboard storm", 12, "storm", "drop", { hb: 2, build: { hats: 4, snare: 8, arp: 8, stab: 8 } }]],
  [["dark and light", 12, "glow", "cut", { db: 1 }]],
  [["yours", 8, "flash", "drop", { key: 2, hb: 2, db: 10 }]],
  [
    ["docker run", 3, "hush", "cut", { gap: 8 }],
    ["land", 5, "land", "hit"],
    ["afterglow", 4, "afterglow"],
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
  [["hook", 4, "tension", "none", { db: -17 }]],
  [["find and ignite", 8, "drop", "drop"]],
  [["mixes", 4, "groove", "hit", { db: -4 }]],
  [["handoff", 4, "lift", "cut", { db: -7 }]],
  [["flashes", 4, "storm", "drop", { db: 9 }]],
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

/** Cues the shots and cuts export (scripts/audio/shot-cues.ts reads S<n>_CUES and CUT_<id>_CUES): the real frames of everything on screen. */
const SHOT_CUES = shotCues as readonly UiEvent[];
const CUT_CUES = cutCues as readonly UiEvent[];

interface Def {
  rows: readonly Row[];
  pins: readonly Pin[];
  runs?: readonly (readonly [string, number, number, number])[];
  final: string;
  over: number;
  slow: number;
  finalGap: number;
}

const DEFS: Record<Film, Def> = {
  hero: { rows: HERO, pins: [], final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
  tour: { rows: TOUR, pins: TOUR_PINS, runs: TOUR_RUNS, final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
  cutdown: { rows: CUTDOWN, pins: [], final: "afterglow", over: 2, slow: 0.72, finalGap: 8 },
};

function specOf(film: Film): FilmSpec {
  const def = DEFS[film];
  const table = segments(def.rows);
  const base = createClock(table);
  const final = base.starts[table.findIndex((s) => s.id === def.final)] ?? base.totalBeats;
  const ritard: Ritard = { final, over: def.over, slow: def.slow };
  return {
    id: film,
    segments: table,
    ritard,
    ui: [...manifest(def.rows, def.pins, def.runs), ...(film === "hero" ? SHOT_CUES : film === "cutdown" ? CUT_CUES : [])].sort(
      (a, b) => a.frame - b.frame,
    ),
    finalGap: def.finalGap,
  };
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
