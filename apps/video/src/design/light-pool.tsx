import type { CSSProperties, ReactNode } from "react";

export interface Pool {
  x: number;
  y: number;
  radius: number;
  dim?: number;
  wash?: number;
}

const FALLOFF = "#000 0%, rgb(0 0 0 / 0.86) 24%, rgb(0 0 0 / 0.5) 52%, rgb(0 0 0 / 0.16) 78%, transparent 100%";

const fill: CSSProperties = { position: "absolute", inset: 0 };

/** A lit area that follows the action: dark copy, bright masked copy, faint warm wash. */
export function LightPool({ x, y, radius, dim = 0.22, wash = 0.1, children }: Pool & { children: ReactNode }) {
  const mask = `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${FALLOFF})`;
  return (
    <div style={fill}>
      <div style={{ ...fill, filter: `brightness(${dim})` }}>{children}</div>
      <div style={{ ...fill, maskImage: mask, WebkitMaskImage: mask }}>{children}</div>
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
