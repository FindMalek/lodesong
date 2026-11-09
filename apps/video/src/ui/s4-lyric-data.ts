import { filmManifest, plateBox } from "../captures/film-manifest";
import { songFrames } from "./s4-kit";

interface LyricWord {
  text: string;
  at: number;
  x0: number;
  x1: number;
}

export interface LyricLine {
  text: string;
  length: number;
  y: number;
  h: number;
  words: readonly LyricWord[];
}

function lineOf(index: number, active: { y: number; h: number }, edges: readonly (readonly [number, number])[]): LyricLine {
  const lines = filmManifest.lyrics?.lines ?? [];
  const line = lines[index];
  if (!line) throw new Error(`film manifest: no lyric line ${index}`);
  const next = lines[index + 1];
  const words = line.words ?? [];
  return {
    text: line.text,
    length: (next?.start ?? line.start + 5000) - line.start,
    y: active.y,
    h: active.h,
    words: words.map((word, i) => ({ text: word.text, at: word.start - line.start, x0: edges[i]?.[0] ?? 0, x1: edges[i]?.[1] ?? 0 })),
  };
}

export const LINE_SAY: LyricLine = lineOf(4, plateBox("lyrics-full", "word-04-0", "active"), [
  [617, 670.5],
  [679.5, 698.5],
  [707.5, 815],
  [824.5, 878.5],
  [887.5, 907],
  [915.5, 1001],
]);

export const LINE_STAY: LyricLine = lineOf(7, plateBox("lyrics-full", "click-line", "active"), [
  [617, 682.5],
  [692, 761.5],
  [770, 820.5],
  [830, 922.5],
  [931, 1017.5],
]);

/** Distance between two lyric lines in the full-screen view, CSS px, measured between the rows on the plates. */
const LINE_PITCH = 71.4;

/** The column scrolls up by this much when the click on the second line lands: where that line sat on word-04 (three rows down) minus where the click plate has it. */
export const SCROLL_DY = LINE_SAY.y + 3 * LINE_PITCH - LINE_STAY.y;

/** How much faster than the real song the film sings: the line takes 4.2 s instead of 5. */
export const SING_RATE = 1.2;

export interface WordSpan {
  from: number;
  to: number;
}

export function wordSpans(line: LyricLine, start: number, rate: number = SING_RATE): WordSpan[] {
  return line.words.map((word, i) => ({
    from: start + songFrames(word.at, rate),
    to: start + songFrames(line.words[i + 1]?.at ?? line.length, rate),
  }));
}

export const fillOf = (frame: number, span: WordSpan): number =>
  span.to <= span.from ? (frame >= span.from ? 1 : 0) : Math.min(1, Math.max(0, (frame - span.from) / (span.to - span.from)));
