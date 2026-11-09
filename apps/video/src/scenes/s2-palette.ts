import { plateBox, plateSrc, take } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import type { CursorStop } from "../design/cursor";
import { plateKeys, plateLayout } from "../design/plate";
import type { Box } from "../design/probe";
import { typedCount, typingFrames } from "../design/typing";
import { shotOf } from "./timelines";

/** The captured app is 1440x810 CSS px at device scale 2; every box below is in those px. */
const TAKE = "find-the-line";
export const PLATE = plateLayout({ w: take(TAKE).w, h: take(TAKE).h });

const QUERY = "lights on";
export const S2_FRAMES = shotOf("find-line").frames;

export const KEY_AT = 14;
export const OPEN_AT = 18;
const TYPE_AT = 30;
export const LANDINGS = typingFrames(QUERY, TYPE_AT, 3);
export const RESULTS_AT = (LANDINGS.at(-1) ?? TYPE_AT) + 10;
export const DOWN_AT = 206;
export const ENTER_AT = 252;
export const WHIP_AT = 268;
export const WHIP_FRAMES = 18;
const UNDERLINE_AT = RESULTS_AT + 8;
const UNDERLINE_STEP = 5;

export const ROW1: Box = plateBox(TAKE, "results", "row1");
const INPUT: Box = plateBox(TAKE, "palette-empty", "input");
const MARKED: Box = plateBox(TAKE, "results", "mark");
export const BRACKET_AT = 150;
const ROW_VIEW: Box = { x: ROW1.x, y: ROW1.y, w: 540, h: 100 };
export const PALETTE: Box = { x: 379, y: 147, w: 682, h: 515 };
export const ROW_STEP = 84.97;
const CONTEXT_VIEW: Box = { x: 430, y: 214, w: 250, h: 52 };
/** The captured mark covers "lights"; the underline runs on over " on". */
export const MARK = { x: MARKED.x, w: 47, y: MARKED.y + MARKED.h + 3 };

/** Which captured still the app shows on a frame: album, empty palette, one still per typed letter, then the settled results. */
export const ALBUM = plateSrc(TAKE, "album");

export function plateAt(frame: number): string {
  if (frame < OPEN_AT) return ALBUM;
  if (frame >= RESULTS_AT) return plateSrc(TAKE, "results");
  const typed = typedCount(frame, LANDINGS);
  return plateSrc(TAKE, typed === 0 ? "palette-empty" : `type-0${typed}`);
}

const g = (frame: number): number => frame / 30;

export const CARET = (typed: number): { x: number; y: number } => ({ x: INPUT.x + 6 + 8.4 * typed, y: INPUT.y + INPUT.h / 2 });

export const S2_KEYS = plateKeys(PLATE, [
  { at: g(0), box: { x: 0, y: 0, w: 1440, h: 810 }, scale: 1, ry: -3, rx: 0.6 },
  { at: g(36), box: { x: 380, y: 148, w: 680, h: 260 }, scale: 1.55, ry: 2.2, rx: 0 },
  { at: g(104), box: { x: 380, y: 160, w: 680, h: 200 }, scale: 2, ry: -1.6, rx: 0.4 },
  { at: g(128), box: { x: 380, y: 170, w: 680, h: 190 }, scale: 2.2, ry: -0.8, rx: 0.2 },
  { at: g(160), box: CONTEXT_VIEW, scale: 3.2, ry: 1, rx: 0 },
  { at: g(208), box: CONTEXT_VIEW, scale: 3.5, ry: 2, rx: 0 },
  { at: g(244), box: ROW_VIEW, scale: 2.5, ry: 1.6, rx: 0 },
  { at: g(330), box: ROW_VIEW, scale: 2.7, ry: 2.4, rx: 0 },
]);

export const CURSOR_STOPS: CursorStop[] = [
  { at: g(RESULTS_AT + 4), x: 1010, y: 300 },
  { at: g(150), x: 556, y: 236, dwell: 1.1 },
  { at: g(DOWN_AT + 20), x: 1180, y: 380 },
];

export const underlineAt = (row: number): number => UNDERLINE_AT + row * UNDERLINE_STEP;

const S2_UNSORTED: readonly ShotCue[] = [
  { shot: "find-line", at: KEY_AT, kind: "key", label: "cmd k keycap thock" },
  { shot: "find-line", at: OPEN_AT, kind: "ping", label: "palette opens" },
  ...LANDINGS.map((at, i): ShotCue => ({ shot: "find-line", at, kind: "tick", label: `key ${QUERY[i] === " " ? "space" : QUERY[i]}` })),
  { shot: "find-line", at: RESULTS_AT, kind: "ping", label: "results land" },
  { shot: "find-line", at: underlineAt(0), kind: "tick", label: "underline 1" },
  { shot: "find-line", at: underlineAt(1), kind: "tick", label: "underline 2" },
  { shot: "find-line", at: underlineAt(2), kind: "tick", label: "underline 3" },
  { shot: "find-line", at: 138, kind: "swell", label: "camera cuts in on the lyric" },
  { shot: "find-line", at: BRACKET_AT, kind: "tick", label: "bracket draws round the match" },
  { shot: "find-line", at: 208, kind: "riser", label: "riser into the drop" },
  { shot: "find-line", at: DOWN_AT, kind: "key", label: "arrow down selects the line" },
  { shot: "find-line", at: ENTER_AT, kind: "key", label: "enter plays from it" },
  { shot: "find-line", at: WHIP_AT, kind: "whoosh", label: "whip up to the player bar" },
];

export const S2_CUES: readonly ShotCue[] = [...S2_UNSORTED].sort((a, b) => a.at - b.at);
