import { Easing, useCurrentFrame } from "remotion";
import { gridBeat as beat } from "./beat";
import { ease, lerp, ramp } from "./motion";

export interface CursorStop {
  at: number;
  x: number;
  y: number;
  click?: boolean;
  dwell?: number;
}

export interface CursorState {
  x: number;
  y: number;
  press: number;
}

const GLIDE = Easing.bezier(0.4, 0, 0.12, 1);
const PRESS_IN = 4;
const PRESS_OUT = 12;
const DWELL = 0.25;

function departure(from: CursorStop, to: CursorStop): number {
  const arrive = beat(to.at);
  const leave = beat(from.at + (from.dwell ?? DWELL));
  return Math.min(leave, beat(from.at) + (arrive - beat(from.at)) * 0.5);
}

/** A hand-moved path: each leg bows sideways and glides; a click stop presses and ripples (and is where state and sound change). */
export function cursorAt(frame: number, stops: readonly CursorStop[]): CursorState {
  const first = stops[0];
  if (!first) return { x: 0, y: 0, press: 0 };
  let x = first.x;
  let y = first.y;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!a || !b) continue;
    const start = departure(a, b);
    if (frame < start) break;
    const t = GLIDE(Math.min(1, (frame - start) / Math.max(1, beat(b.at) - start)));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bow = (i % 2 === 0 ? 1 : -1) * 0.16;
    const cx = (a.x + b.x) / 2 - dy * bow;
    const cy = (a.y + b.y) / 2 + dx * bow;
    x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
    y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
  }
  let press = 0;
  for (const stop of stops) {
    if (!stop.click) continue;
    const at = beat(stop.at);
    if (frame >= at - PRESS_IN && frame < at) press = Math.max(press, (frame - (at - PRESS_IN)) / PRESS_IN);
    if (frame >= at) press = Math.max(press, 1 - ramp(frame, at, PRESS_OUT));
  }
  return { x, y, press };
}

export const clickFrames = (stops: readonly CursorStop[]): number[] => stops.filter((stop) => stop.click).map((stop) => beat(stop.at));

const RIPPLE = beat(1);

function ClickRipples({ stops, size = 1 }: { stops: readonly CursorStop[]; size?: number }) {
  const frame = useCurrentFrame();
  return (
    <>
      {stops
        .filter((stop) => stop.click)
        .flatMap((stop) =>
          [0, 7].map((delay) => {
            const age = frame - beat(stop.at) - delay;
            if (age < 0 || age > RIPPLE) return null;
            const t = age / RIPPLE;
            const radius = lerp(6, delay === 0 ? 64 : 40, ease.out(t)) * size;
            return (
              <i
                key={`${stop.at}-${delay}`}
                style={{
                  position: "absolute",
                  left: stop.x - radius,
                  top: stop.y - radius,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: "50%",
                  border: `${2.5 * size}px solid var(--ignite)`,
                  opacity: (1 - t) ** 1.6,
                }}
              />
            );
          }),
        )}
    </>
  );
}

interface CursorProps {
  stops: readonly CursorStop[];
  size?: number;
}

/** The pointer as an actor: gold-ringed arrow travelling the stop list, in plate px. */
export function Cursor({ stops, size = 30 }: CursorProps) {
  const frame = useCurrentFrame();
  const { x, y, press } = cursorAt(frame, stops);
  const ring = size * 0.62 * (1 - press * 0.35);
  return (
    <>
      <ClickRipples stops={stops} size={size / 30} />
      <i
        style={{
          position: "absolute",
          left: x - ring,
          top: y - ring,
          width: ring * 2,
          height: ring * 2,
          borderRadius: "50%",
          border: `${Math.max(1.5, size / 14)}px solid color-mix(in oklch, var(--ignite) 85%, transparent)`,
          background: `color-mix(in oklch, var(--ignite) ${Math.round(12 + press * 26)}%, transparent)`,
        }}
      />
      <svg
        aria-hidden
        width={size * 0.7}
        height={size}
        viewBox="0 0 16 24"
        style={{
          position: "absolute",
          left: x - 1,
          top: y - 1,
          overflow: "visible",
          transform: `scale(${1 - press * 0.12})`,
          transformOrigin: "1px 1px",
          filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.55))",
        }}
      >
        <path
          d="M1 1 L1 20 L5.6 15.8 L9 23 L12 21.6 L8.7 14.6 L15 14.2 Z"
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}
