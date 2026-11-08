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
  const path = useMemo(() => {
    const cells = ditherCells(cols, cols, seed, time);
    if (develop < 1) {
      for (let i = 0; i < cells.length; i += 1) if (hash(i + seed) > develop) cells[i] = 0;
    }
    return ditherPath(cells, cols, CELL);
  }, [cols, seed, time, develop]);
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
