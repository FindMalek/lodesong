import type { ShotCue } from "../captures/types";
import { FILM } from "../copy";
import { hash } from "../design/motion";
import { shotOf } from "./timelines";

const shot = shotOf("land");

/** The README's install command, line by line: the film types exactly this. */
export const S12_LINES: readonly string[] = FILM.end.docker;

const TYPE_FROM = 2;
const CHARS_PER_FRAME = 2.6;
const LINE_GAP = 4;

/** Frame each character of each line lands on: a fast, slightly uneven burst, the way a pasted command streams in. */
export const S12_TYPED: readonly (readonly number[])[] = S12_LINES.reduce<{ at: number; lines: number[][] }>(
  (acc, line, row) => {
    const frames: number[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const at = acc.at + Math.floor(i / CHARS_PER_FRAME + hash(i * 3.1 + row * 17) * 0.9);
      frames.push(Math.max(at, frames.at(-1) ?? at));
    }
    return { at: (frames.at(-1) ?? acc.at) + LINE_GAP, lines: [...acc.lines, frames] };
  },
  { at: TYPE_FROM, lines: [] },
).lines;

export const S12_TIMES = {
  typeFrom: TYPE_FROM,
  enter: shot.beat(3),
  travelled: shot.beat(3.8),
  settled: shot.beat(5.8),
  band: shot.beat(3.4),
  wordmark: shot.beat(3.9),
  tagline: shot.beat(4.4),
  lyric: shot.beat(4.8),
  chip: shot.beat(7.4),
  rest: shot.beat(8) - 8,
  hit: shot.beat(8),
  end: shot.frames,
} as const;

const STRIDE = 3;

export const S12_CUES: readonly ShotCue[] = [
  ...S12_TYPED.flatMap((frames, row) =>
    frames.filter((_, i) => i % STRIDE === 0).map((at): ShotCue => ({ shot: "land", at, kind: "key", label: `type: line ${row + 1}` })),
  ),
  { shot: "land", at: S12_TIMES.enter, kind: "impact", label: "enter: the install command runs, the gold cover ignites" },
  { shot: "land", at: S12_TIMES.enter, kind: "swell", label: "pull-back swell, 5 beats" },
  { shot: "land", at: S12_TIMES.wordmark, kind: "tick", label: "lodesong draws in" },
  { shot: "land", at: S12_TIMES.tagline, kind: "tick", label: "your music. your server." },
  { shot: "land", at: S12_TIMES.lyric, kind: "ping", label: "the lyric returns lit" },
  { shot: "land", at: S12_TIMES.chip, kind: "ping", label: "works with navidrome" },
  { shot: "land", at: S12_TIMES.rest, kind: "rest", label: "8 frames of silence before the last hit" },
  { shot: "land", at: S12_TIMES.hit, kind: "impact", label: "last hit and chord (G6 to Am9), url lands, 1.5 s tail" },
].sort((a, b) => a.at - b.at);
