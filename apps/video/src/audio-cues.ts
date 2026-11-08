import { beat } from "./design/beat";

type CueKind = "kick" | "hit" | "riser" | "tick" | "key" | "ping" | "whoosh" | "impact" | "swell";
export type Film = "hero" | "cutdown";
type Style = "cut" | "drop" | "gold" | "brand" | "reverse" | "bloom" | "down" | "plain" | "quiet" | "enter" | "typed";

export interface AudioCue {
  id: string;
  frame: number;
  kind: CueKind;
  label: string;
  film: Film;
  /** frames, for sounds that last (riser, swell, whoosh) */
  length?: number;
}

export interface SheetCue extends AudioCue {
  note?: number;
  gain: number;
  pan: number;
  style?: Style;
}

export const FILM_BEATS: Record<Film, number> = { hero: 60, cutdown: 30 };
export const FILM_FRAMES: Record<Film, number> = { hero: beat(60), cutdown: beat(30) };

export const SECTIONS: Record<Film, readonly { id: string; from: number; to: number }[]> = {
  hero: [
    { id: "intro", from: 0, to: 6 },
    { id: "drop", from: 6, to: 12 },
    { id: "wide app", from: 12, to: 16 },
    { id: "queue", from: 16, to: 26 },
    { id: "mixes", from: 26, to: 36 },
    { id: "session", from: 36, to: 46 },
    { id: "terminal", from: 46, to: 52 },
    { id: "build", from: 52, to: 54 },
    { id: "end card", from: 54, to: 60 },
  ],
  cutdown: [
    { id: "hook", from: 0, to: 5 },
    { id: "lyrics", from: 5, to: 18 },
    { id: "strip", from: 18, to: 25 },
    { id: "end card", from: 25, to: 30 },
  ],
};

interface Spec {
  at: number;
  kind: CueKind;
  label: string;
  note?: number;
  gain?: number;
  pan?: number;
  beats?: number;
  style?: Style;
}

const range = (from: number, to: number, step = 1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const TYPED_GAPS = [4, 5, 4, 6, 4, 5, 7, 4, 5, 4, 6] as const;
const TYPED_START = 1395;
const TYPED_FRAMES: readonly number[] = TYPED_GAPS.reduce<number[]>(
  (frames, gap) => frames.concat((frames.at(-1) ?? 0) + gap),
  [TYPED_START],
);
const TYPED_CHARS = [..."lodesong now"];

const kicks = (from: number, to: number, label: string, gain: number, out: readonly number[] = []): Spec[] =>
  range(from, to)
    .filter((at) => !out.includes(at))
    .map((at): Spec => ({ at, kind: "kick", label, gain }));

const HERO: readonly Spec[] = [
  { at: 0, kind: "tick", label: "hairline starts drawing", note: 96, gain: 0.5 },
  { at: 1, kind: "ping", label: "your music. lands (motif, first note)", note: 76 },
  { at: 2, kind: "ping", label: "your server. lands (motif, second note)", note: 81 },
  { at: 4, kind: "riser", label: "riser into the drop", beats: 1.75 },
  { at: 5.5, kind: "whoosh", label: "headline leaves", beats: 0.5, gain: 0.7 },
  { at: 6, kind: "hit", label: "the drop: lyrics close-up", style: "drop" },
  { at: 6, kind: "whoosh", label: "key chip rises", beats: 0.75 },
  ...kicks(6, 35, "kick", 0.85, [10, 11, 14, 15, 24, 25, 34, 35]),
  ...kicks(36, 45, "kick", 1, [44, 45]),
  { at: 7, kind: "key", label: "y key press" },
  { at: 7.5, kind: "ping", label: "lyric lines land", note: 88 },
  { at: 8.5, kind: "swell", label: "gold builds", beats: 0.4, style: "reverse" },
  { at: 9, kind: "impact", label: "cover turns gold", style: "gold", gain: 0.7 },
  { at: 9, kind: "ping", label: "line: i keep the lights on", note: 84 },
  { at: 11, kind: "ping", label: "line: hold the signal violet", note: 81 },
  { at: 12, kind: "hit", label: "hard cut to the wide app", style: "cut" },
  { at: 11.75, kind: "whoosh", label: "whoosh into the cut", beats: 0.5 },
  { at: 12.25, kind: "tick", label: "sidebar lands", note: 91, gain: 0.6, pan: -0.4 },
  { at: 12.5, kind: "tick", label: "player bar lands", note: 88, gain: 0.6, pan: 0.4 },
  { at: 13, kind: "tick", label: "lyrics panel lifts forward", note: 96, gain: 0.7 },
  { at: 14, kind: "riser", label: "riser into the queue", beats: 2 },
  { at: 16, kind: "hit", label: "hard cut to the queue", style: "cut" },
  { at: 16, kind: "whoosh", label: "queue panel rises", beats: 0.75 },
  { at: 17, kind: "key", label: "q key press" },
  ...[84, 86, 88, 91, 93].map(
    (note, i): Spec => ({
      at: 17.25 + i * 0.25,
      kind: "tick",
      label: `queue row ${i + 2} rises`,
      note,
      gain: 0.55,
      pan: i % 2 ? 0.3 : -0.3,
    }),
  ),
  { at: 19, kind: "tick", label: "row 4 drags to position 2", note: 79, gain: 0.9 },
  { at: 21, kind: "tick", label: "next up slides in", note: 91, gain: 0.7, pan: 0.4 },
  { at: 24, kind: "riser", label: "riser into the mixes", beats: 2 },
  { at: 26, kind: "hit", label: "hard cut to the mixes", style: "cut" },
  { at: 26, kind: "swell", label: "mix chord", beats: 2, style: "bloom" },
  { at: 26.25, kind: "tick", label: "second source cover develops", note: 84, gain: 0.55, pan: -0.3 },
  { at: 26.5, kind: "tick", label: "third source cover develops", note: 88, gain: 0.55, pan: 0.3 },
  { at: 28, kind: "whoosh", label: "covers slide together", beats: 1, gain: 1.4 },
  { at: 29, kind: "tick", label: "covers merge into the mix", note: 74, gain: 0.9 },
  ...[84, 86, 88, 91].map(
    (note, i): Spec => ({
      at: 31 + i * 0.5,
      kind: "tick",
      label: `mix label ${i + 1} resolves`,
      note,
      gain: 0.5,
      pan: i % 2 ? 0.35 : -0.35,
    }),
  ),
  { at: 34, kind: "riser", label: "riser into the session", beats: 2 },
  { at: 36, kind: "impact", label: "the full drop: one session", style: "drop" },
  { at: 36, kind: "whoosh", label: "laptop window mask-in", beats: 1 },
  { at: 36.5, kind: "tick", label: "phone frame lands", note: 93, gain: 0.7, pan: 0.4 },
  { at: 37, kind: "key", label: "play key press" },
  { at: 39, kind: "ping", label: "handoff: laptop", note: 81, pan: -0.5, gain: 2 },
  { at: 39.25, kind: "ping", label: "handoff: phone", note: 88, pan: 0.5, gain: 1.5 },
  { at: 39.25, kind: "tick", label: "terminal blip", note: 100, gain: 0.7, pan: 0.2 },
  ...[81, 84, 86, 88, 91].map(
    (note, i): Spec => ({ at: 40 + i, kind: "tick", label: `device chip ${i + 1}`, note, gain: 0.9, pan: i % 2 ? 0.3 : -0.3 }),
  ),
  { at: 44, kind: "riser", label: "riser out of the session", beats: 2, gain: 1.5 },
  { at: 46, kind: "swell", label: "music filters down", beats: 0.5, style: "down" },
  ...TYPED_FRAMES.map(
    (frame, i): Spec => ({
      at: frame / beat(1),
      kind: "key",
      label: `terminal types "${TYPED_CHARS[i]}"`,
      gain: 0.45,
      style: "typed",
    }),
  ),
  { at: 49, kind: "key", label: "terminal enter", gain: 0.8, style: "enter" },
  { at: 49.5, kind: "ping", label: "now-playing block resolves", note: 76, gain: 0.7 },
  { at: 50, kind: "ping", label: "your server. echoes", note: 81, gain: 0.7 },
  { at: 52, kind: "riser", label: "build to the end card", beats: 2, style: "quiet" },
  ...[52, 53, 53.5].map((at): Spec => ({ at, kind: "kick", label: "kick roll into the silence", gain: 0.7 })),
  { at: 54.5, kind: "hit", label: "end card sub hit", style: "brand", gain: 0.55 },
  { at: 55, kind: "ping", label: "lodesong: lode (motif, first note)", note: 76, gain: 1.1 },
  { at: 55.5, kind: "ping", label: "lodesong: song (motif, second note)", note: 81, gain: 1.1 },
  { at: 56, kind: "tick", label: "url line fades in", note: 93, gain: 0.45 },
];

const CUTDOWN: readonly Spec[] = [
  { at: 0, kind: "ping", label: "your music. lands (motif, first note)", note: 76 },
  { at: 1, kind: "ping", label: "your server. lands (motif, second note)", note: 81 },
  { at: 3.5, kind: "riser", label: "riser into the drop", beats: 1.25 },
  { at: 3, kind: "whoosh", label: "headline leaves", beats: 0.5, gain: 0.7 },
  { at: 5, kind: "hit", label: "the drop: lyrics", style: "drop" },
  { at: 5, kind: "whoosh", label: "key chip rises", beats: 0.75 },
  ...kicks(5, 17, "kick", 0.85, [16, 17]),
  { at: 7, kind: "key", label: "y key press", gain: 1.4 },
  { at: 7.5, kind: "ping", label: "lyric lines land", note: 88 },
  { at: 8.5, kind: "swell", label: "gold builds", beats: 0.4, style: "reverse" },
  { at: 9, kind: "impact", label: "cover turns gold", style: "gold", gain: 0.7 },
  { at: 9, kind: "ping", label: "line: i keep the lights on", note: 84 },
  { at: 11, kind: "ping", label: "line: hold the signal violet", note: 81 },
  { at: 13, kind: "ping", label: "lyrics scroll: line 4", note: 79, gain: 0.8 },
  { at: 15, kind: "ping", label: "lyrics scroll: line 5", note: 76, gain: 0.8 },
  { at: 17, kind: "ping", label: "lyrics scroll: line 6", note: 74, gain: 1.2 },
  { at: 18, kind: "hit", label: "cut to phone and terminal", style: "cut" },
  { at: 18, kind: "whoosh", label: "strip slides in", beats: 0.75 },
  ...kicks(18, 24, "kick", 1, [23, 24]),
  { at: 19, kind: "ping", label: "handoff: laptop", note: 81, pan: -0.5, gain: 2 },
  { at: 19.25, kind: "ping", label: "handoff: phone", note: 88, pan: 0.5, gain: 1.5 },
  { at: 19.25, kind: "tick", label: "terminal blip", note: 100, gain: 0.7, pan: 0.2 },
  ...[81, 84, 86, 88, 91].map(
    (note, i): Spec => ({ at: 20 + i, kind: "tick", label: `device chip ${i + 1}`, note, gain: 0.9, pan: i % 2 ? 0.3 : -0.3 }),
  ),
  { at: 23, kind: "riser", label: "riser into the end card", beats: 2, gain: 1.5 },
  { at: 26, kind: "hit", label: "end card sub hit", style: "brand", gain: 0.55 },
  { at: 27, kind: "ping", label: "lodesong: lode (motif, first note)", note: 76, gain: 1.1 },
  { at: 27.5, kind: "ping", label: "lodesong: song (motif, second note)", note: 81, gain: 1.1 },
  { at: 28, kind: "tick", label: "url line fades in", note: 93, gain: 0.45 },
];

const SHEETS: Record<Film, readonly Spec[]> = { hero: HERO, cutdown: CUTDOWN };

function build(film: Film): SheetCue[] {
  const seen = new Map<string, number>();
  return [...SHEETS[film]]
    .map((spec): SheetCue => {
      const frame = beat(spec.at);
      const base = `${film}-${spec.kind}-${frame}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return {
        id: count === 0 ? base : `${base}-${count}`,
        frame,
        kind: spec.kind,
        label: spec.label,
        film,
        gain: spec.gain ?? 1,
        pan: spec.pan ?? 0,
        ...(spec.note === undefined ? {} : { note: spec.note }),
        ...(spec.beats === undefined ? {} : { length: beat(spec.at + spec.beats) - frame }),
        ...(spec.style === undefined ? {} : { style: spec.style }),
      };
    })
    .sort((a, b) => a.frame - b.frame);
}

/** Everything the score plays, with the synthesis parameters. The audio script renders this table. */
export const SHEET: readonly SheetCue[] = [...build("hero"), ...build("cutdown")];

/** What the visuals read: one row per sound, frames at 60 fps, derived from SHEET so it cannot drift from the WAV. */
export const AUDIO_CUES: readonly AudioCue[] = SHEET.map(({ id, frame, kind, label, film, length }) => ({
  id,
  frame,
  kind,
  label,
  film,
  ...(length === undefined ? {} : { length }),
}));
