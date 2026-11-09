import type { CSSProperties } from "react";

const CELL = 6;
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43,
  1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

interface DitherTextProps {
  text: string;
  size: number;
  width: number;
  height: number;
  /** 0 to 1: how much of the line has resolved from the dither cells; sweeps left to right. */
  progress: number;
  weight?: number;
  color?: string;
  glow?: number;
  legible?: boolean;
  style?: CSSProperties;
}

function cellsAt(progress: number, cols: number, rows: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1) {
      const threshold = 0.45 * ((BAYER[(y % 8) * 8 + (x % 8)] ?? 0) / 64) + 0.55 * (x / cols);
      if (threshold < progress) out.push({ x: x * CELL, y: y * CELL });
    }
  return out;
}

/** A line of type that resolves out of the brand's own ordered-dither cells (an SVG clip, no mask), with an optional gold glow behind it. */
export function DitherText({
  text,
  size,
  width,
  height,
  progress,
  weight = 600,
  color = "var(--foreground)",
  glow = 0,
  legible,
  style,
}: DitherTextProps) {
  if (progress <= 0) return null;
  const done = progress >= 1;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const id = `dt-${text.length}-${size}`;
  const face: CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: weight, letterSpacing: "-0.045em", fontSize: size };
  const baseline = size * 0.82;
  const clip = done ? undefined : `url(#${id})`;
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      {done ? null : (
        <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
          <clipPath id={id}>
            {cellsAt(progress * 1.02, cols, rows).map((cell) => (
              <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={CELL} height={CELL} />
            ))}
          </clipPath>
        </svg>
      )}
      {glow > 0 ? (
        <svg
          aria-hidden
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, filter: "blur(22px)", opacity: glow, mixBlendMode: "plus-lighter" }}
        >
          <text x={0} y={baseline} style={face} fill="var(--ignite)" clipPath={clip}>
            {text}
          </text>
        </svg>
      ) : null}
      <svg aria-hidden width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <text x={0} y={baseline} style={face} fill={color} clipPath={clip} data-legible={legible ? "" : undefined}>
          {text}
        </text>
      </svg>
    </div>
  );
}
