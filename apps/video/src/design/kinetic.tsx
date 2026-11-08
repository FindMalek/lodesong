import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { beat } from "./beat";
import { ease, lerp, ramp } from "./motion";

export const VOID = "color-mix(in oklch, var(--background), black 55%)";

interface MaskLineProps {
  children: ReactNode;
  from: number;
  out?: number;
  length?: number;
  style?: CSSProperties;
}

/** A line that rises out of a clipped box on `from` and, if `out` is set, leaves through the top: the premium default reveal. */
export function MaskLine({ children, from, out, style, length = beat(1) }: MaskLineProps) {
  const frame = useCurrentFrame();
  const entering = ramp(frame, from, length);
  const leaving = out === undefined ? 0 : ramp(frame, out, beat(0.5), ease.in);
  const y = leaving > 0 ? lerp(0, -110, leaving) : lerp(110, 0, entering);
  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em", ...style }}>
      <div style={{ transform: `translateY(${y}%)` }}>{children}</div>
    </div>
  );
}

/** Small mono caps label with open tracking and tabular numerals. */
export function Label({ children, style, legible }: { children: ReactNode; style?: CSSProperties; legible?: boolean }) {
  return (
    <span
      data-legible={legible ? "" : undefined}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 26,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
        color: "var(--muted-foreground)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
