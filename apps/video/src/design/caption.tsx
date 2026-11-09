import type { CSSProperties } from "react";
import { gridBeat as beat } from "./beat";
import { MaskLine } from "./kinetic";

interface CaptionProps {
  lines: readonly string[];
  from: number;
  out?: number;
  font: number;
  style?: CSSProperties;
}

/** Sound-off headline: masked lines rising a quarter beat apart, the first in ink and the rest muted, one message per shot. */
export function Caption({ lines, from, out, font, style }: CaptionProps) {
  return (
    <div
      data-legible=""
      style={{ position: "absolute", fontSize: font, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.04, ...style }}
    >
      {lines.map((line, index) => (
        <MaskLine
          key={line}
          from={from + beat(0.25) * index}
          out={out}
          style={index > 0 ? { color: "var(--muted-foreground)" } : undefined}
        >
          {line}
        </MaskLine>
      ))}
    </div>
  );
}
