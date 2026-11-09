import type { ShotCue } from "../captures/types";
import { FILM } from "../copy";
import { hash } from "../design/motion";
import type { Box } from "../design/probe";
import type { FlashIcon } from "../ui/s11-flash";
import { shotOf } from "./timelines";

const shot = shotOf("land");

/** The README's install command, line by line: the film types exactly this. */
export const S12_LINES: readonly string[] = FILM.end.docker;

const INTERCUT_BEATS = 3;
const TYPE_FROM = shot.beat(INTERCUT_BEATS) + 2;
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

export interface Intercut {
  id: string;
  take: string;
  plate: string;
  chip: string;
  icon: FlashIcon;
  focus?: Box;
  scale: readonly [number, number];
}

export const S12_INTERCUTS: readonly Intercut[] = [
  { id: "queue", take: "queue", plate: "queue", chip: "queue", icon: "queue", focus: { x: 900, y: 44, w: 540, h: 701 }, scale: [1.3, 1.5] },
  {
    id: "mixes",
    take: "home-mixes",
    plate: "home",
    chip: "mixes",
    icon: "mixes",
    focus: { x: 200, y: 540, w: 1240, h: 240 },
    scale: [1.5, 1.7],
  },
  {
    id: "session",
    take: "devices",
    plate: "picker",
    chip: "one session",
    icon: "devices",
    focus: { x: 860, y: 560, w: 580, h: 250 },
    scale: [1.5, 1.7],
  },
];

export const S12_TIMES = {
  intercutEnd: shot.beat(INTERCUT_BEATS),
  enter: shot.beat(5.5),
  travelled: shot.beat(6.3),
  settled: shot.beat(8.3),
  band: shot.beat(6.9),
  wordmark: shot.beat(7.2),
  tagline: shot.beat(7.6),
  rest: shot.beat(10) - 8,
  hit: shot.beat(10),
  end: shot.frames,
} as const;

const STRIDE = 3;

export const S12_CUES: readonly ShotCue[] = [
  ...S12_INTERCUTS.map((cut, i): ShotCue => ({ shot: "land", at: shot.beat(i), kind: "hit", label: `${cut.id}: quick cut` })),
  ...S12_TYPED.flatMap((frames, row) =>
    frames.filter((_, i) => i % STRIDE === 0).map((at): ShotCue => ({ shot: "land", at, kind: "key", label: `type: line ${row + 1}` })),
  ),
  { shot: "land", at: S12_TIMES.enter, kind: "impact", label: "enter: the install command runs, the gold cover ignites" },
  { shot: "land", at: S12_TIMES.enter, kind: "swell", label: "pull-back swell, 5 beats" },
  { shot: "land", at: S12_TIMES.wordmark, kind: "tick", label: "lodesong draws in" },
  { shot: "land", at: S12_TIMES.tagline, kind: "tick", label: "your music. your server." },
  { shot: "land", at: S12_TIMES.rest, kind: "rest", label: "8 frames of silence before the last hit" },
  { shot: "land", at: S12_TIMES.hit, kind: "impact", label: "last hit and chord (G6 to Am9), url lands, 1.5 s tail" },
].sort((a, b) => a.at - b.at);
