import { eventsOf, plateBox } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import type { Box } from "../design/probe";
import { shotOf } from "./timelines";

export type CutMove = "push" | "pull" | "whip-left" | "whip-right";

export interface KeyCut {
  id: string;
  beat: number;
  take: string;
  plate: string;
  keys: readonly string[];
  chip: string;
  focus: Box;
  scale: readonly [number, number];
  move: CutMove;
  /** plate px box that gets a gold bracket once the key lands */
  mark?: Box;
}

const DIALOG = plateBox("shortcuts-sheet", "sheet", "dialog");
const TOAST = plateBox("moments-save", "saved", "toast");
const SEEK = plateBox("moments-save", "saved", "seek");
const BAR = plateBox("transport-keys", "paused", "bar");
const PENCIL = eventsOf("rebind").find((event) => event.target)?.target ?? { x: 684, y: 204, w: 24, h: 24 };

/** Eight one-beat cuts at 136 bpm: every cut is a keystroke, every keystroke is a drum hit. */
export const S10_CUTS: readonly KeyCut[] = [
  {
    id: "sheet",
    beat: 0,
    take: "shortcuts-sheet",
    plate: "sheet",
    keys: ["?"],
    chip: "every shortcut",
    focus: DIALOG,
    scale: [1.2, 1.4],
    move: "push",
  },
  {
    id: "albums",
    beat: 1,
    take: "chords",
    plate: "albums",
    keys: ["g", "a"],
    chip: "albums",
    focus: { x: 220, y: 50, w: 720, h: 330 },
    scale: [1.5, 1.3],
    move: "pull",
  },
  {
    id: "artists",
    beat: 2,
    take: "chords",
    plate: "artists",
    keys: ["g", "r"],
    chip: "artists",
    focus: { x: 220, y: 40, w: 760, h: 300 },
    scale: [1.6, 1.4],
    move: "whip-left",
  },
  {
    id: "stats",
    beat: 3,
    take: "chords",
    plate: "stats",
    keys: ["g", "t"],
    chip: "stats",
    focus: { x: 240, y: 40, w: 900, h: 150 },
    scale: [1.6, 1.8],
    move: "whip-right",
  },
  {
    id: "moment",
    beat: 4,
    take: "moments-save",
    plate: "saved",
    keys: ["b"],
    chip: "save a moment",
    focus: { x: TOAST.x - 120, y: TOAST.y - 20, w: TOAST.w + 240, h: SEEK.y + 16 - TOAST.y + 20 },
    scale: [1.7, 2],
    move: "push",
    mark: SEEK,
  },
  {
    id: "moments",
    beat: 5,
    take: "moments-save",
    plate: "moments",
    keys: ["g", "m"],
    chip: "moments",
    focus: { x: 200, y: 60, w: 800, h: 300 },
    scale: [2, 1.7],
    move: "pull",
  },
  {
    id: "play",
    beat: 6,
    take: "transport-keys",
    plate: "paused",
    keys: ["space"],
    chip: "play pause",
    focus: { x: BAR.x + 300, y: BAR.y - 185, w: 840, h: 250 },
    scale: [1.7, 1.5],
    move: "whip-left",
  },
  {
    id: "rebind",
    beat: 7,
    take: "rebind",
    plate: "rebinding",
    keys: ["?"],
    chip: "rebind any key",
    focus: { x: PENCIL.x - 204, y: PENCIL.y - 44, w: 480, h: 220 },
    scale: [1.7, 2],
    move: "push",
    mark: { x: PENCIL.x - 112, y: PENCIL.y - 5, w: 136, h: 32 },
  },
];

export const STRIKE = 2;

export function cutFrames(cut: KeyCut): { from: number; frames: number; strikes: number[] } {
  const shot = shotOf("keys");
  const from = shot.beat(cut.beat);
  const end = shot.beat(cut.beat + 1);
  const eighth = shot.beat(cut.beat + 0.5) - from;
  return { from, frames: end - from, strikes: cut.keys.map((_, i) => STRIKE + i * eighth) };
}

const WHIP_CUTS = S10_CUTS.filter((cut) => cut.move.startsWith("whip"));

/** Sound events in shot-local frames: a key hit on every strike, a whoosh into each whip, a snare roll that rises into the flashes. */
export const S10_CUES: readonly ShotCue[] = [
  ...S10_CUTS.flatMap((cut) => {
    const { from, strikes } = cutFrames(cut);
    return cut.keys.map(
      (key, i): ShotCue => ({
        shot: "keys",
        at: from + (strikes[i] ?? 0),
        kind: "key",
        label: `${cut.id}: ${key}`,
      }),
    );
  }),
  ...WHIP_CUTS.map((cut): ShotCue => ({ shot: "keys", at: cutFrames(cut).from, kind: "whoosh", label: `${cut.id}: ${cut.move}` })),
  { shot: "keys", at: shotOf("keys").beat(6.5), kind: "riser", label: "snare roll into the flashes" },
].sort((a, b) => a.at - b.at);
