import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { beat } from "./beat";
import { ease, ramp } from "./motion";

const CELL = 10;
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43,
  1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

/** The cut: the new shot is uncovered through an ordered-dither mask sweeping left to right, the brand's own texture as the transition. */
export function DitherWipe({ from = 0, length = beat(0.5) }: { from?: number; length?: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const t = ramp(frame, from, length, ease.inOut);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, cols, rows);
    if (t >= 1) return;
    const image = context.createImageData(cols, rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const threshold = 0.4 * ((BAYER[(y % 8) * 8 + (x % 8)] ?? 0) / 64) + 0.6 * (x / cols);
        if (threshold > t * 1.05) image.data.set([7, 7, 7, 255], (y * cols + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
  }, [t, cols, rows]);
  if (t >= 1 || frame < from) return null;
  return (
    <canvas
      ref={canvas}
      width={cols}
      height={rows}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }}
    />
  );
}
