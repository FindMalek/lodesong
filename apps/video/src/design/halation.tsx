import type { CSSProperties, ReactNode } from "react";

interface HalationProps {
  strength?: number;
  radius?: number;
  fill?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

/** Light bleeding past bright edges: a blurred warm copy added back over the original. */
export function Halation({ strength = 0.2, radius = 26, fill = false, style, children }: HalationProps) {
  const box: CSSProperties = fill ? { position: "absolute", inset: 0 } : { position: "relative" };
  return (
    <div style={{ ...box, ...style }}>
      {children}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          mixBlendMode: "plus-lighter",
          opacity: strength,
          filter: `blur(${radius}px) sepia(1) saturate(2.6) brightness(1.5)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
