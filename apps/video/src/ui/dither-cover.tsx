import { ditherCells, ditherPath, ditherSeed } from "@lodesong/shared/dither";
import { useMemo } from "react";
import { hash } from "../design/motion";

interface DitherCoverProps {
  id: string;
  size: number;
  /** 0 to 1: the share of dots that have developed; the cover starts blank and resolves dot by dot. */
  develop?: number;
  /** Seconds fed to the glow drift, so the picture breathes with the frame clock. */
  time?: number;
  color?: string;
  bare?: boolean;
  opacity?: number;
}

const CELL = 4;

const PATHS = new Map<string, string>();
const PATHS_KEPT = 48;

/** One path per (cols, seed, time, develop): the same cover drawn twice in a frame (sharp plus glow) and a scrub back over a frame cost one computation. */
function coverPath(cols: number, seed: number, time: number, develop: number): string {
  const key = `${cols}|${seed}|${time}|${develop}`;
  const kept = PATHS.get(key);
  if (kept !== undefined) return kept;
  const cells = ditherCells(cols, cols, seed, time);
  if (develop < 1) {
    for (let i = 0; i < cells.length; i += 1) if (hash(i + seed) > develop) cells[i] = 0;
  }
  const path = ditherPath(cells, cols, CELL);
  if (PATHS.size >= PATHS_KEPT) PATHS.delete(PATHS.keys().next().value ?? key);
  PATHS.set(key, path);
  return path;
}

/** The app's own generated cover look: the shared ordered-dither glow, drawn as one SVG path, deterministic per frame. */
export function DitherCover({
  id,
  size,
  develop = 1,
  time = 0,
  color = "var(--foreground)",
  bare = false,
  opacity = 0.85,
}: DitherCoverProps) {
  const cols = Math.ceil(size / CELL);
  const seed = ditherSeed(id);
  const path = useMemo(() => coverPath(cols, seed, time, develop), [cols, seed, time, develop]);
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${cols * CELL} ${cols * CELL}`}
      style={{ display: "block", background: bare ? "transparent" : "var(--card)" }}
    >
      <path d={path} fill={color} fillOpacity={opacity} />
    </svg>
  );
}
