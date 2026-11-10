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
const PENCIL = eventsOf("rebind").find((event) => event.target)?.target ?? { x: 684, y: 204, w: 24, h: 24 };

/** Six two-beat moments at 136 bpm: a keycap and a plate held for about 0.9 s, every keystroke a drum hit. */
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
    beat: 2,
    take: "chords",
    plate: "albums",
    keys: ["g", "a"],
    chip: "jump to a page",
    focus: { x: 220, y: 50, w: 720, h: 330 },
    scale: [1.5, 1.3],
    move: "whip-left",
  },
  {
    id: "stats",
    beat: 4,
    take: "chords",
    plate: "stats",
    keys: ["g", "t"],
    chip: "two keys",
    focus: { x: 240, y: 40, w: 900, h: 150 },
    scale: [1.6, 1.8],
    move: "whip-right",
  },
  {
    id: "moment",
    beat: 6,
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
    id: "list",
    beat: 8,
    take: "list-keys",
    plate: "focused",
    keys: ["j", "k"],
    chip: "move through lists",
    focus: { x: 220, y: 180, w: 1000, h: 420 },
    scale: [1.45, 1.65],
    move: "whip-left",
  },
  {
    id: "rebind",
    beat: 10,
    take: "rebind",
    plate: "rebinding",
    keys: ["?"],
    chip: "change any key",
    focus: { x: PENCIL.x - 204, y: PENCIL.y - 44, w: 480, h: 220 },
    scale: [1.7, 2],
    move: "push",
    mark: { x: PENCIL.x - 112, y: PENCIL.y - 5, w: 136, h: 32 },
  },
];

export const STRIKE = 2;
export const MOMENT_BEATS = 2;

export function cutFrames(cut: KeyCut): { from: number; frames: number; strikes: number[] } {
  const shot = shotOf("keys");
  const from = shot.beat(cut.beat);
  const end = shot.beat(cut.beat + MOMENT_BEATS);
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
  ...S10_CUTS.map(
    (cut): ShotCue => ({ shot: "keys", at: shotOf("keys").beat(cut.beat + 1), kind: "tick", label: `${cut.id}: chip settles` }),
  ),
  { shot: "keys", at: shotOf("keys").beat(10.5), kind: "riser", label: "snare roll into the flashes" },
].sort((a, b) => a.at - b.at);
