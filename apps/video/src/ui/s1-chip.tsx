import { useCurrentFrame } from "remotion";
import { MaskLine } from "../design/kinetic";

interface ShotChipProps {
  text: string;
  from: number;
  out?: number;
  left?: number;
  right?: number;
  top?: number;
}

const RISE = 14;

/** The one tiny chip each shot carries: mono caps, 1 px hairline, rises out of a clipped box and leaves through the top. */
export function ShotChip({ text, from, out, left, right, top = 72 }: ShotChipProps) {
  const frame = useCurrentFrame();
  if (out !== undefined && frame > out + 20) return null;
  return (
    <div style={{ position: "absolute", left: left ?? (right === undefined ? 72 : undefined), right, top }}>
      <MaskLine from={from} out={out} length={RISE}>
        <span
          data-legible=""
          style={{
            display: "inline-block",
            fontFamily: "var(--font-mono)",
            fontSize: 30,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontVariantNumeric: "tabular-nums",
            color: "var(--foreground)",
            background: "color-mix(in oklch, var(--background) 78%, transparent)",
            border: "2px solid color-mix(in oklch, var(--foreground) 34%, transparent)",
            padding: "10px 20px",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </span>
      </MaskLine>
    </div>
  );
}
