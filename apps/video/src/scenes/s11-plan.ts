import type { ShotCue } from "../captures/types";
import type { Box } from "../design/probe";
import type { FlashIcon } from "../ui/s11-flash";
import { shotOf } from "./timelines";

type FlashKind = "plate" | "split" | "cards" | "server";

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

/** Four equal flashes: offline, share cards, a split library frame, and the plain-language one on who owns the files. */
const EACH = shotOf("yours").beats / 4;

export const S11_FLASHES: readonly Flash[] = [
  {
    id: "offline",
    beats: EACH,
    kind: "plate",
    take: "offline",
    plate: "offline",
    chip: "plays offline",
    icon: "plane",
    focus: { x: 200, y: 0, w: 900, h: 340 },
    scale: [1.75, 1.45],
  },
  { id: "share", beats: EACH, kind: "cards", chip: "share cards", icon: "share" },
  {
    id: "library",
    beats: EACH,
    kind: "split",
    take: "following",
    plate: "following",
    chip: "following",
    icon: "users",
    focus: { x: 200, y: 330, w: 1240, h: 440 },
    scale: [1.4, 1.6],
    right: {
      take: "doctor",
      plate: "fixed",
      chip: "library health",
      icon: "doctor",
      focus: { x: 150, y: 40, w: 700, h: 180 },
      scale: [2.1, 2.25],
    },
  },
  { id: "server", beats: EACH, kind: "server", chip: "your files stay yours", icon: "server" },
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
