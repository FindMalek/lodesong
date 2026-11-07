import { ditherCells, ditherSeed } from "@lodesong/shared/dither";
import { useEffect, useRef } from "react";
import { colors } from "@/components/aura";
import { subscribeTheme } from "@/lib/theme";

const COLS = 48;
const FRAME_MS = 120;

/** A dithered cover seeded by `id`. It drifts slowly while on screen, and holds one still frame under reduced motion. */
export function Dither({ id, className }: { id: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const seed = ditherSeed(id);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let frame = 0;
    let last = 0;
    const paint = (time: number) => {
      const rows = Math.max(1, Math.round((COLS * element.clientHeight) / Math.max(1, element.clientWidth)));
      if (element.width !== COLS || element.height !== rows) {
        element.width = COLS;
        element.height = rows;
      }
      const { ink, paper } = colors();
      const cells = ditherCells(COLS, rows, seed, time);
      context.globalAlpha = 1;
      context.fillStyle = paper;
      context.fillRect(0, 0, COLS, rows);
      context.fillStyle = ink;
      context.globalAlpha = 0.3;
      for (let index = 0; index < cells.length; index += 1) {
        if (cells[index]) context.fillRect(index % COLS, Math.floor(index / COLS), 1, 1);
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (visible && !document.hidden && now - last >= FRAME_MS) {
        last = now;
        paint(now / 1000);
      }
      if (visible && !still.matches) frame = requestAnimationFrame(tick);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      paint(0);
      if (visible && !still.matches) frame = requestAnimationFrame(tick);
    };
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      restart();
    });
    watch.observe(element);
    const resize = new ResizeObserver(() => paint(0));
    resize.observe(element);
    still.addEventListener("change", restart);
    const unsubscribe = subscribeTheme(() => paint(0));
    restart();
    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      resize.disconnect();
      still.removeEventListener("change", restart);
      unsubscribe();
    };
  }, [id]);

  return <canvas ref={canvas} aria-hidden className={className} style={{ imageRendering: "pixelated" }} />;
}
