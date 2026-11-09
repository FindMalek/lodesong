import type { CSSProperties, ReactNode } from "react";
import { Easing, Img, useCurrentFrame } from "remotion";
import { plateSrc } from "../captures/film-manifest";
import { FPS } from "../design/beat";
import { ease, lerp, ramp } from "../design/motion";
import { type PlateLayout, plateLayout } from "../design/plate";
import type { Box } from "../design/probe";
import { Keycap, pressAt } from "./keycap";

export const PLATE_PX = { w: 1440, h: 810 };
export const LAYOUT: PlateLayout = plateLayout(PLATE_PX);

/** "take/plate", resolved through the typed capture manifest so an unknown plate fails the render instead of drawing nothing. */
export const plateFile = (name: string): string => {
  const [take, plate] = name.split("/");
  return plateSrc(take ?? "", plate ?? "");
};

export const grid = (frame: number): number => frame / 30;

export const BRIGHT = "brightness(1.5)";

const planeStyle: CSSProperties = { position: "absolute", transformOrigin: "0 0" };

export function PlateFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...planeStyle,
        left: LAYOUT.left,
        top: LAYOUT.top,
        width: LAYOUT.size.w,
        height: LAYOUT.size.h,
        transform: `scale(${LAYOUT.k})`,
      }}
    >
      {children}
    </div>
  );
}

interface PatchProps {
  src: string;
  box: Box;
  at?: { x: number; y: number };
  scale?: number;
  filter?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** A crop of a real plate, drawn anywhere: how rows, tiles and sliders are moved without re-drawing a single pixel of the app. */
export function Patch({ src, box, at, scale = 1, filter, style, children }: PatchProps) {
  const x = at?.x ?? box.x;
  const y = at?.y ?? box.y;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: box.w * scale, height: box.h * scale, overflow: "hidden", ...style }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          left: -box.x * scale,
          top: -box.y * scale,
          width: PLATE_PX.w * scale,
          height: PLATE_PX.h * scale,
          filter,
          maxWidth: "none",
        }}
      />
      {children}
    </div>
  );
}

/** One gold, one place: svg filter that turns bright type in a crop into the ignite colour and drops the rest to transparent. */
export function GoldText({ id = "s4-gold" }: { id?: string }) {
  return (
    <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.5 1.5 1.5 0 -1.1" result="mask" />
        <feFlood style={{ floodColor: "var(--ignite)" }} result="gold" />
        <feComposite in="gold" in2="mask" operator="in" />
      </filter>
    </svg>
  );
}

interface ChipProps {
  text: string;
  from: number;
  out?: number;
  x: number;
  y: number;
  lit?: number;
}

const CHIP_FONT = 30;

export function Chip({ text, from, out, x, y, lit = -1 }: ChipProps) {
  const frame = useCurrentFrame();
  const entering = ramp(frame, from, 10);
  const leaving = out === undefined ? 0 : ramp(frame, out, 8, ease.in);
  if (entering <= 0 || leaving >= 1) return null;
  const parts = text.split("  ");
  const rise = leaving > 0 ? lerp(0, -120, leaving) : lerp(120, 0, entering);
  return (
    <div style={{ position: "absolute", left: x, top: y, overflow: "hidden", paddingBottom: 2 }}>
      <div
        data-legible={entering >= 1 && leaving <= 0 ? "" : undefined}
        style={{
          transform: `translateY(${rise}%)`,
          display: "inline-flex",
          gap: 22,
          padding: "10px 20px",
          fontFamily: "var(--font-mono)",
          fontSize: CHIP_FONT,
          letterSpacing: "0.04em",
          color: "var(--foreground)",
          background: "color-mix(in oklch, var(--background) 88%, transparent)",
          border: "1px solid color-mix(in oklch, var(--foreground) 34%, transparent)",
          whiteSpace: "nowrap",
        }}
      >
        {parts.map((part, i) => (
          <span key={part} style={{ color: i === lit ? "var(--ignite)" : undefined }}>
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}

interface KeyStampProps {
  label: string;
  at: number;
  hold?: number;
  x?: number;
  y?: number;
  size?: number;
  wide?: boolean;
}

export function KeyStamp({ label, at, hold = 26, x = 96, y = 786, size = 108, wide = false }: KeyStampProps) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, at - 6, 6);
  const leave = ramp(frame, at + hold, 6, ease.in);
  if (rise <= 0 || leave >= 1) return null;
  const shift = leave > 0 ? lerp(0, -130, leave) : lerp(130, 0, rise);
  return (
    <div style={{ position: "absolute", left: x, top: y, overflow: "hidden", paddingBottom: 8 }}>
      <div style={{ transform: `translateY(${shift}%)` }}>
        <Keycap label={label} size={size} wide={wide} bright press={pressAt(frame, at, 3, 8)} legible={rise >= 1 && leave <= 0} />
      </div>
    </div>
  );
}

const THROW = Easing.bezier(0.8, 0, 0.12, 1);
const BLUR_ID = "s4-whip";

interface ShotTransitProps {
  frames: number;
  leave?: "left" | "right" | null;
  arrive?: "left" | "right" | null;
  length?: number;
  children: ReactNode;
}

const REACH = 0.5;

/** The shot's whip pan: it arrives from one side and leaves to the other, cut mid-move on both ends so two shots read as one swing of the camera. */
export function ShotTransit({ frames, leave = "left", arrive = null, length = 7, children }: ShotTransitProps) {
  const frame = useCurrentFrame();
  const out = leave ? THROW(Math.min(1, Math.max(0, (frame - (frames - length)) / length))) : 0;
  const inn = arrive ? 1 - THROW(Math.min(1, frame / length)) : 0;
  const sign = (side: "left" | "right" | null): number => (side === "left" ? -1 : 1);
  const shift = (leave ? sign(leave) * out * REACH : 0) + (arrive ? -sign(arrive) * inn * REACH : 0);
  const blur = Math.abs(shift) > 0.01 ? Math.min(90, Math.abs(shift) * 150) : 0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translateX(${shift * 1920}px)`,
        filter: blur > 0 ? `url(#${BLUR_ID})` : undefined,
      }}
    >
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <filter id={BLUR_ID} x="-20%" y="-5%" width="140%" height="110%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${blur} 0`} />
        </filter>
      </svg>
      {children}
    </div>
  );
}

export const songFrames = (ms: number, rate: number): number => Math.round(((ms / 1000) * FPS) / rate);
