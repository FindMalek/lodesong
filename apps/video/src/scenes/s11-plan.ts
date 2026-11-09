import type { ShotCue } from "../captures/types";
import type { Box } from "../design/probe";
import { shotOf } from "./timelines";

type FlashKind = "plate" | "cards" | "scroll" | "ro";
export type FlashIcon = "plane" | "share" | "sun" | "rows" | "users" | "palette" | "doctor" | "lock";

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
}

/** One flash per beat at 138 bpm (26 frames): recognisable in under half a second, so each is one big plate and one chip. */
export const S11_FLASHES: readonly Flash[] = [
  {
    id: "offline",
    kind: "plate",
    take: "offline",
    plate: "offline",
    chip: "plays offline",
    icon: "plane",
    focus: { x: 200, y: 0, w: 900, h: 340 },
    scale: [1.75, 1.45],
  },
  { id: "share", kind: "cards", chip: "share cards", icon: "share" },
  {
    id: "light",
    kind: "plate",
    take: "theme-light",
    plate: "home",
    chip: "light mode",
    icon: "sun",
    focus: { x: 220, y: 40, w: 1200, h: 460 },
    scale: [1.15, 1.35],
    bright: true,
  },
  { id: "scroll", kind: "scroll", chip: "10,000 songs", icon: "rows" },
  {
    id: "following",
    kind: "plate",
    take: "following",
    plate: "following",
    chip: "following",
    icon: "users",
    focus: { x: 200, y: 330, w: 1240, h: 440 },
    scale: [1.4, 1.65],
  },
  {
    id: "themes",
    kind: "plate",
    take: "settings-appearance",
    plate: "settings-appearance",
    chip: "your own look",
    icon: "palette",
    focus: { x: 345, y: 80, w: 770, h: 560 },
    scale: [1.45, 1.7],
  },
  {
    id: "doctor",
    kind: "plate",
    take: "doctor",
    plate: "fixed",
    chip: "library doctor",
    icon: "doctor",
    focus: { x: 215, y: 40, w: 1000, h: 380 },
    scale: [1.3, 1.5],
  },
  { id: "privacy", kind: "ro", chip: "never touches your files", icon: "lock" },
];

export function flashFrames(index: number): { from: number; frames: number } {
  const shot = shotOf("yours");
  const from = shot.beat(index * FLASH_BEATS);
  return { from, frames: shot.beat((index + 1) * FLASH_BEATS) - from };
}

export const REST_FRAMES = 8;

const FLASH_BEATS = 1;

export const S11_CUES: readonly ShotCue[] = [
  ...S11_FLASHES.map((flash, i): ShotCue => ({ shot: "yours", at: flashFrames(i).from, kind: "hit", label: `${flash.id}: flash` })),
  { shot: "yours", at: shotOf("yours").beat(0.5), kind: "riser", label: "snare roll keeps rolling from the storm" },
  { shot: "yours", at: shotOf("yours").frames - REST_FRAMES, kind: "rest", label: "8 frames of silence, the breath before land" },
].sort((a, b) => a.at - b.at);
