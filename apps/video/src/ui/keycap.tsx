import type { CSSProperties } from "react";

interface KeycapProps {
  label: string;
  size?: number;
  /** 0 to 1: how far the key is down (4 px travel at size 96) */
  press?: number;
  bright?: boolean;
  wide?: boolean;
  style?: CSSProperties;
  legible?: boolean;
}

/** Square hairline keycap. It sinks a few pixels and loses its base edge when pressed, the way a real key does. */
export function Keycap({ label, size = 96, press = 0, bright = false, wide = false, style, legible = false }: KeycapProps) {
  const travel = size * 0.06;
  return (
    <div
      data-legible={legible ? "" : undefined}
      style={{
        height: size,
        minWidth: size,
        width: wide ? "auto" : size,
        padding: wide ? `0 ${size * 0.3}px` : 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: size * 0.42,
        background: bright ? "var(--foreground)" : "var(--card)",
        color: bright ? "var(--background)" : "var(--foreground)",
        border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
        boxShadow: `0 ${travel * (1 - press)}px 0 color-mix(in oklch, var(--foreground) ${bright ? 55 : 22}%, transparent)`,
        transform: `translateY(${travel * press}px)`,
        ...style,
      }}
    >
      {label}
    </div>
  );
}

/** One press: down over a quarter beat, back up over a half. `at` is the frame of the strike. */
export function pressAt(frame: number, at: number, down: number, up: number): number {
  if (frame < at) return 0;
  if (frame < at + down) return (frame - at) / down;
  return Math.max(0, 1 - (frame - at - down) / up);
}
