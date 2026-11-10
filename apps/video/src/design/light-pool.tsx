import type { CSSProperties, ReactNode } from "react";

export interface Pool {
  x: number;
  y: number;
  radius: number;
  dim?: number;
  wash?: number;
}

const FLOOR = 0.66;

/** How much of the lift each radius keeps (share of the radius, share lit): the pool is the dark overlay turned inside out. */
const FALLOFF: readonly (readonly [number, number])[] = [
  [0, 1],
  [24, 0.86],
  [52, 0.5],
  [78, 0.16],
  [100, 0],
];

const fill: CSSProperties = { position: "absolute", inset: 0 };

/** A lit area that follows the action: the plate at full light, a black falloff over everything outside the pool, a faint warm wash. No mask-image: the dimming is a plain gradient layer. */
export function LightPool({ x, y, radius, dim = 0.6, wash = 0.16, children }: Pool & { children: ReactNode }) {
  const depth = 1 - Math.max(dim, FLOOR);
  const stops = FALLOFF.map(([at, lit]) => `rgb(0 0 0 / ${((1 - lit) * depth).toFixed(3)}) ${at}%`).join(", ");
  return (
    <div style={fill}>
      <div style={fill}>{children}</div>
      <div style={{ ...fill, background: `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${stops})` }} />
      <div
        style={{
          ...fill,
          mixBlendMode: "plus-lighter",
          background: `radial-gradient(circle ${radius * 0.8}px at ${x}px ${y}px, color-mix(in oklch, var(--ignite) ${Math.round(wash * 100)}%, transparent), transparent 100%)`,
        }}
      />
    </div>
  );
}
