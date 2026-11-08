import { ditherCells, ditherSeed } from "@lodesong/shared/dither";
import { useEffect, useRef } from "react";
import { colors } from "@/components/aura";
import { onDriftFrame } from "@/lib/drift-clock";
import { subscribeTheme } from "@/lib/theme";

const CELL_PX = 4;

/** Dithered ink dots over whatever is behind, seeded by `id`. They drift slowly while on screen and hold one frame under reduced motion. */
export function Dither({ id, className }: { id: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const seed = ditherSeed(id);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let size: { width: number; height: number } | null = null;
    let ink: string | null = null;
    let stopDrift: (() => void) | null = null;
    const paint = () => {
      if (!size) return;
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(size.width * scale));
      const height = Math.max(1, Math.round(size.height * scale));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      const cell = Math.max(1, Math.round(CELL_PX * scale));
      const cols = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);
      const cells = ditherCells(cols, rows, seed, still.matches ? 0 : performance.now() / 1000);
      ink ??= colors().ink;
      context.clearRect(0, 0, width, height);
      context.fillStyle = ink;
      context.globalAlpha = 0.3;
      for (let index = 0; index < cells.length; index += 1) {
        if (cells[index]) context.fillRect((index % cols) * cell, Math.floor(index / cols) * cell, cell, cell);
      }
    };
    const sync = () => {
      stopDrift?.();
      stopDrift = null;
      if (!visible) return;
      paint();
      if (!document.hidden && !still.matches) stopDrift = onDriftFrame(paint);
    };
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      sync();
    });
    watch.observe(element);
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      size = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (visible) paint();
    });
    resize.observe(element);
    still.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const unsubscribe = subscribeTheme(() => {
      ink = null;
      if (visible) paint();
    });
    return () => {
      stopDrift?.();
      watch.disconnect();
      resize.disconnect();
      still.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      unsubscribe();
    };
  }, [id]);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
