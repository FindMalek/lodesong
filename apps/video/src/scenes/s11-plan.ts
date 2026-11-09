import type { ShotCue } from "../captures/types";
import type { Box } from "../design/probe";
import type { FlashIcon } from "../ui/s11-flash";
import { shotOf } from "./timelines";

type FlashKind = "plate" | "split" | "cards" | "scroll" | "ro";

interface FlashHalf {
  take: string;
  plate: string;
  chip: string;
  icon: FlashIcon;
  focus: Box;
  scale: readonly [number, number];
}

export interface Flash {
  id: string;
  kind: FlashKind;
  take?: string;
  plate?: string;
  chip: string;
  icon: FlashIcon;
  focus?: Box;
  scale?: readonly [number, number];
  bright?: boolean;
  beats: number;
  right?: FlashHalf;
}

/** Four flashes of two beats at 138 bpm; light mode lives in the themes shot now, and the privacy line goes last because it is the why. */
export const S11_FLASHES: readonly Flash[] = [
  {
    id: "offline",
    beats: 2,
    kind: "plate",
    take: "offline",
    plate: "offline",
    chip: "plays offline",
    icon: "plane",
    focus: { x: 200, y: 0, w: 900, h: 340 },
    scale: [1.75, 1.45],
  },
  { id: "share", beats: 2, kind: "cards", chip: "share cards", icon: "share" },
  { id: "scroll", beats: 2, kind: "scroll", chip: "10,000 songs", icon: "rows" },
  { id: "privacy", beats: 2, kind: "ro", chip: "never touches your files", icon: "lock" },
];

const startBeat = (index: number): number => S11_FLASHES.slice(0, index).reduce((sum, flash) => sum + flash.beats, 0);

export function flashFrames(index: number): { from: number; frames: number } {
  const shot = shotOf("yours");
  const from = shot.beat(startBeat(index));
  return { from, frames: shot.beat(startBeat(index + 1)) - from };
}

export const REST_FRAMES = 8;

export const S11_CUES: readonly ShotCue[] = [
  ...S11_FLASHES.map((flash, i): ShotCue => ({ shot: "yours", at: flashFrames(i).from, kind: "hit", label: `${flash.id}: flash` })),
  ...S11_FLASHES.flatMap((flash, i): ShotCue[] =>
    flash.beats > 1
      ? [{ shot: "yours", at: shotOf("yours").beat(startBeat(i) + 1), kind: "tick", label: `${flash.id}: chip settles` }]
      : [],
  ),
  { shot: "yours", at: shotOf("yours").beat(1), kind: "riser", label: "snare roll keeps rolling from the storm" },
  { shot: "yours", at: shotOf("yours").frames - REST_FRAMES, kind: "rest", label: "8 frames of silence, the breath before land" },
].sort((a, b) => a.at - b.at);
