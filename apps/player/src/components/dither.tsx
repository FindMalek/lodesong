import { ditherCells, ditherSeed } from "@lodesong/shared/dither";
import { useEffect, useRef } from "react";
import { colors } from "@/components/aura";
import { subscribeTheme } from "@/lib/theme";

const CELL_PX = 4;
const FRAME_MS = 500;

/** Dithered ink dots over whatever is behind, seeded by `id`. They drift slowly while on screen and hold one frame under reduced motion. */
export function Dither({ id, className }: { id: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const seed = ditherSeed(id);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let timer = 0;
    const paint = () => {
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(element.clientWidth * scale));
      const height = Math.max(1, Math.round(element.clientHeight * scale));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      const cell = Math.max(1, Math.round(CELL_PX * scale));
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const cells = ditherCells(cols, rows, seed, still.matches ? 0 : performance.now() / 1000);
      context.clearRect(0, 0, width, height);
      context.fillStyle = colors().ink;
      context.globalAlpha = 0.3;
      for (let index = 0; index < cells.length; index += 1) {
        if (cells[index]) context.fillRect((index % cols) * cell, Math.floor(index / cols) * cell, cell, cell);
      }
    };
    const sync = () => {
      clearInterval(timer);
      timer = 0;
      paint();
      if (visible && !document.hidden && !still.matches) timer = window.setInterval(paint, FRAME_MS);
    };
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      sync();
    });
    watch.observe(element);
    const resize = new ResizeObserver(paint);
    resize.observe(element);
    still.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const unsubscribe = subscribeTheme(paint);
    sync();
    return () => {
      clearInterval(timer);
      watch.disconnect();
      resize.disconnect();
      still.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      unsubscribe();
    };
  }, [id]);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
