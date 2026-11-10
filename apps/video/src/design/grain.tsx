import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { hash } from "./motion";

const W = 480;
const H = 270;

/** Film grain: one chunky noise field per frame (4 px cells at 1080p), re-seeded each frame so it crawls like emulsion. */
export function Grain({ opacity = 0.07 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const image = context.createImageData(W, H);
    const pixels = new Uint32Array(image.data.buffer);
    for (let i = 0; i < pixels.length; i += 1) {
      const value = Math.floor(hash(i + frame * 7919) * 255);
      pixels[i] = 0xff000000 | (value << 16) | (value << 8) | value;
    }
    context.putImageData(image, 0, 0);
  }, [frame]);
  return (
    <canvas
      ref={canvas}
      width={W}
      height={H}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        mixBlendMode: "overlay",
        opacity,
      }}
    />
  );
}

/** Edges fall toward the page color: the eye stays in the middle and the frame edge hides banding. */
export function Vignette({ strength = 0.3 }: { strength?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 55%, color-mix(in oklch, black ${strength * 100}%, transparent) 100%)`,
      }}
    />
  );
}
