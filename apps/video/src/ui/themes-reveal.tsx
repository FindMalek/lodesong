import type { ReactNode } from "react";

const CELL = 40;
const COLS = 48;
const ROWS = 27;
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43,
  1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

const cells = (progress: number): { x: number; y: number }[] => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < ROWS; y += 1)
    for (let x = 0; x < COLS; x += 1) {
      const threshold = 0.5 * ((BAYER[(y % 8) * 8 + (x % 8)] ?? 0) / 64) + 0.5 * (x / COLS);
      if (threshold < progress) out.push({ x: x * CELL, y: y * CELL });
    }
  return out;
};

/** A new look applied through the brand's own ordered dither: it sweeps in cell by cell from the left, then is whole. */
export function DitherReveal({ progress, children }: { progress: number; children: ReactNode }) {
  if (progress >= 1) return <div style={{ position: "absolute", inset: 0 }}>{children}</div>;
  return (
    <>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <clipPath id="look-reveal">
          {cells(progress * 1.04).map((cell) => (
            <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={CELL} height={CELL} />
          ))}
        </clipPath>
      </svg>
      <div style={{ position: "absolute", inset: 0, clipPath: "url(#look-reveal)" }}>{children}</div>
    </>
  );
}
