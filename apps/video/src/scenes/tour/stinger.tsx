import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ease, ramp } from "../../design/motion";
import { Caret } from "../../design/typing";
import { CHAPTERS, type Chapter } from "../../features";
import { SAFE } from "./chip";
import { revealed } from "./reveal";

const CELL = 10;
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43,
  1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

interface VeilProps {
  cover: number;
  from: "left" | "right";
}

export function DitherVeil({ cover, from }: VeilProps) {
  const { width, height } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, cols, rows);
    if (cover <= 0) return;
    const image = context.createImageData(cols, rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const sweep = from === "left" ? x / cols : 1 - x / cols;
        const threshold = 0.4 * ((BAYER[(y % 8) * 8 + (x % 8)] ?? 0) / 64) + 0.6 * sweep;
        if (threshold < cover * 1.05) image.data.set([7, 7, 7, 255], (y * cols + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
  }, [cover, cols, rows, from]);
  if (cover <= 0) return null;
  return (
    <canvas
      ref={canvas}
      width={cols}
      height={rows}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }}
    />
  );
}

export function Counter({ chapter, frames }: { chapter: Chapter; frames: number }) {
  const frame = useCurrentFrame();
  const at = CHAPTERS.findIndex((one) => one.id === chapter);
  const name = CHAPTERS[at]?.name ?? "";
  const text = `${String(at + 1).padStart(2, "0")} / 12  ${name}`;
  const shown = revealed(frame, Math.round(frames * 0.08), frames * 0.62, text.length);
  const rule = ramp(frame, 0, frames * 0.8, ease.inOut);
  return (
    <div style={{ position: "absolute", right: SAFE.x, bottom: SAFE.y + 16, textAlign: "right", fontFamily: "var(--font-mono)" }}>
      <div
        style={{ fontSize: 44, fontWeight: 500, color: "var(--foreground)", whiteSpace: "pre", textShadow: "0 2px 18px rgb(0 0 0 / 0.8)" }}
      >
        {text.slice(0, shown)}
        <Caret frame={frame} typing={shown < text.length} size={44} color="var(--ignite)" />
      </div>
      <div
        style={{
          marginTop: 12,
          marginLeft: "auto",
          height: 4,
          width: 520 * rule,
          background: "var(--ignite)",
          boxShadow: "0 0 18px var(--ignite)",
        }}
      />
    </div>
  );
}
