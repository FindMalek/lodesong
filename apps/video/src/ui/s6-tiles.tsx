import { type ReactNode, useMemo } from "react";
import { plateBox } from "../captures/film-manifest";
import { ease, lerp, ramp } from "../design/motion";
import type { Box } from "../design/probe";
import { BRIGHT, Patch, plateFile } from "./s4-kit";

const FIRST = plateBox("home-mixes", "home", "daily mix 1");
const SECOND = plateBox("home-mixes", "home", "daily mix 2");
const PITCH = SECOND.x - FIRST.x;

export const TILE_COUNT = 7;

export const tileBox = (index: number): Box => ({ x: FIRST.x + PITCH * index, y: FIRST.y, w: FIRST.w, h: FIRST.h });

const CELL = 4;
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43,
  1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
const LEVELS = 40;
const FRONT = 0.07;

interface Veil {
  dark: string;
  front: string;
}

function veilOf(size: number, level: number): Veil {
  const cols = Math.ceil(size / CELL);
  const develop = level / LEVELS;
  let dark = "";
  let front = "";
  const centre = (cols - 1) / 2;
  for (let y = 0; y < cols; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const radial = Math.hypot(x - centre, y - centre) / (centre * 1.42);
      const threshold = 0.5 * ((BAYER[(y % 8) * 8 + (x % 8)] ?? 0) / 64) + 0.5 * radial;
      const cell = `M${x * CELL} ${y * CELL}h${CELL}v${CELL}h${-CELL}z`;
      if (threshold >= develop + FRONT) dark += cell;
      else if (threshold >= develop) front += cell;
    }
  }
  return { dark, front };
}

interface TileVeilProps {
  box: Box;
  develop: number;
}

/** A tile that is still just dots: the capture's own tile is shown through holes in a dark dithered veil that closes up as it develops. */
export function TileVeil({ box, develop }: TileVeilProps) {
  const level = Math.round(Math.min(1, Math.max(0, develop)) * LEVELS);
  const veil = useMemo(() => veilOf(box.w, level), [box.w, level]);
  if (level >= LEVELS) return null;
  return (
    <svg
      aria-hidden
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
      style={{ position: "absolute", left: box.x, top: box.y, overflow: "hidden" }}
    >
      <rect width={box.w} height={box.h} fill="var(--card)" fillOpacity={level === 0 ? 1 : 0} />
      <path d={veil.dark} fill="var(--card)" />
      <path d={veil.front} fill="var(--ignite)" fillOpacity="0.85" />
      <rect x="0.5" y="0.5" width={box.w - 1} height={box.h - 1} fill="none" stroke="var(--border)" strokeOpacity={1 - level / LEVELS} />
    </svg>
  );
}

const HOME = plateFile("home-mixes/home");

export function TileCrop({
  index,
  scale = 1,
  at,
  children,
}: {
  index: number;
  scale?: number;
  at?: { x: number; y: number };
  children?: ReactNode;
}) {
  return (
    <Patch src={HOME} box={tileBox(index)} at={at} scale={scale} filter={BRIGHT}>
      {children}
    </Patch>
  );
}

interface IgniteProps {
  t: number;
}

/** The mix cover catching: a gold wash that spreads from the middle of the dither and multiplies into it, so the grey dots turn gold the way the playing cover does. */
export function Ignite({ t }: IgniteProps) {
  const wave = ease.out(t);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--ignite)",
        mixBlendMode: "multiply",
        clipPath: `circle(${lerp(0, 78, wave)}% at 50% 50%)`,
      }}
    />
  );
}

export const developOf = (frame: number, start: number, length: number): number => ramp(frame, start, length, ease.inOut);
