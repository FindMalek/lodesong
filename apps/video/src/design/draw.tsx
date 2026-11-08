import { useCurrentFrame } from "remotion";
import { beat } from "./beat";
import { ease, ramp } from "./motion";

export interface Point {
  x: number;
  y: number;
}

const drawProgress = (frame: number, at: number, length: number): number => ramp(frame, beat(at), beat(length), ease.inOut);

interface DrawPathProps {
  d: string;
  at: number;
  length?: number;
  width?: number;
  color?: string;
  glow?: boolean;
  size?: { w: number; h: number };
}

/** An SVG path that draws itself (normalised dash offset, so any path works). */
function DrawPath({ d, at, length = 2, width = 3, color = "var(--ignite)", glow = true, size = { w: 1440, h: 900 } }: DrawPathProps) {
  const frame = useCurrentFrame();
  const p = drawProgress(frame, at, length);
  if (p <= 0) return null;
  return (
    <svg
      aria-hidden
      width={size.w}
      height={size.h}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        filter: glow ? `drop-shadow(0 0 ${width * 2.5}px ${color})` : undefined,
      }}
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray="1 1"
        strokeDashoffset={1 - p}
        strokeLinecap="round"
      />
    </svg>
  );
}

function handles(a: Point, b: Point, bend: number, vertical: boolean): [Point, Point] {
  const span = vertical ? b.y - a.y : b.x - a.x;
  const h = span * bend;
  return vertical
    ? [
        { x: a.x, y: a.y + h },
        { x: b.x, y: b.y - h },
      ]
    : [
        { x: a.x + h, y: a.y },
        { x: b.x - h, y: b.y },
      ];
}

function connectPath(a: Point, b: Point, bend = 0.5, vertical = false): string {
  const [c1, c2] = handles(a, b, bend, vertical);
  return `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

export function connectPoint(a: Point, b: Point, t: number, bend = 0.5, vertical = false): Point {
  const [c1, c2] = handles(a, b, bend, vertical);
  const u = 1 - t;
  const [w0, w1, w2, w3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  };
}

interface ConnectLineProps {
  from: Point;
  to: Point;
  at: number;
  length?: number;
  bend?: number;
  vertical?: boolean;
  width?: number;
  pulse?: { at: number; length?: number };
  size?: { w: number; h: number };
}

/** A gold line between two things that draws on, then carries a pulse. Plate px or stage px. */
export function ConnectLine({ from, to, at, length = 2, bend = 0.5, vertical = false, width = 4, pulse, size }: ConnectLineProps) {
  const frame = useCurrentFrame();
  const t = pulse ? drawProgress(frame, pulse.at, pulse.length ?? 1.5) : 0;
  const head = connectPoint(from, to, t, bend, vertical);
  return (
    <>
      <DrawPath d={connectPath(from, to, bend, vertical)} at={at} length={length} width={width} size={size} />
      {pulse && t > 0 && t < 1 ? (
        <i
          style={{
            position: "absolute",
            left: head.x - width * 2.6,
            top: head.y - width * 2.6,
            width: width * 5.2,
            height: width * 5.2,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 ${width * 4}px ${width * 1.5}px var(--ignite)`,
          }}
        />
      ) : null}
    </>
  );
}

interface BracketProps {
  box: { x: number; y: number; w: number; h: number };
  at: number;
  length?: number;
  arm?: number;
  pad?: number;
  width?: number;
}

/** Four corner brackets drawing in around a control. */
export function Bracket({ box, at, length = 0.75, arm = 28, pad = 10, width = 3 }: BracketProps) {
  const { x, y, w, h } = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  const d = [
    `M${x} ${y + arm} V${y} H${x + arm}`,
    `M${x + w - arm} ${y} H${x + w} V${y + arm}`,
    `M${x + w} ${y + h - arm} V${y + h} H${x + w - arm}`,
    `M${x + arm} ${y + h} H${x} V${y + h - arm}`,
  ].join(" ");
  return <DrawPath d={d} at={at} length={length} width={width} />;
}
