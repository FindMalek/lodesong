import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { ease, lerp, ramp } from "../design/motion";

interface ChipProps {
  text: string;
  from: number;
  style?: CSSProperties;
  size?: number;
}

/** The one small product-style label of a shot: mono caps with a hairline, rising out of a clipped box. */
export function Chip({ text, from, style, size = 30 }: ChipProps) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, 14, ease.out);
  return (
    <div style={{ position: "absolute", ...style }}>
      <div
        data-legible=""
        style={{
          clipPath: `inset(${lerp(100, 0, t)}% 0 0 0)`,
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 20px",
          fontFamily: "var(--font-mono)",
          fontSize: size,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--foreground)",
          background: "rgb(0 0 0 / 0.72)",
          border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
          whiteSpace: "nowrap",
        }}
      >
        <i style={{ width: 12, height: 12, background: "var(--ignite)" }} />
        {text}
      </div>
    </div>
  );
}
