import type { CSSProperties, ReactNode } from "react";
import { Img, useCurrentFrame } from "remotion";
import type { Cam } from "../design/camera";
import { VOID } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Keycap, pressAt } from "../ui/keycap";
import { TileVeil } from "../ui/s6-tiles";
import { filmPlate } from "../ui/s8-real-crop";

export const COVER = { x: 200, y: 370, size: 680 };
const CHIP_Y = 1400;
const DESKTOP = { w: 1440, h: 810 };
const COVER_PLATE = { x: 39, y: 48, w: 486, h: 486 };

export const g = (frame: number): number => frame / 30;

interface Range {
  from: number;
  to: number;
}

export interface Drift {
  scale: Range;
  x?: Range;
  y?: Range;
  ry?: Range;
  rx?: Range;
}

const at = (range: Range | undefined, t: number): number => (range ? lerp(range.from, range.to, t) : 0);

/** A slow push over the whole cut: scale, shift and yaw each ease from one pose to the next. */
export function driftCam(frame: number, frames: number, drift: Drift): Cam {
  const t = ramp(frame, 0, frames, ease.inOut);
  return { x: at(drift.x, t), y: at(drift.y, t), scale: at(drift.scale, t), rx: at(drift.rx, t), ry: at(drift.ry, t) };
}

interface WindowProps {
  src?: string;
  plate?: { w: number; h: number };
  box: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  width: number;
  filter?: string;
  fade?: number;
  style?: CSSProperties;
  children?: ReactNode;
}

/** A crop of a real plate laid out at `width` on the stage; children are drawn in plate px so overlays stay registered to the capture. */
export function PlateWindow({ src, plate = DESKTOP, box, x, y, width, filter, fade = 0, style, children }: WindowProps) {
  const k = width / box.w;
  return (
    <div style={{ position: "absolute", left: x, top: y, width, height: box.h * k, overflow: "hidden", ...style }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: plate.w,
          height: plate.h,
          transformOrigin: "0 0",
          transform: `scale(${k}) translate(${-box.x}px, ${-box.y}px)`,
          filter,
        }}
      >
        {src ? <Img src={src} style={{ width: plate.w, height: plate.h, display: "block", maxWidth: "none" }} /> : null}
        {children}
      </div>
      {fade > 0 ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: fade,
              background: `linear-gradient(to bottom, ${VOID}, transparent)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: fade,
              background: `linear-gradient(to top, ${VOID}, transparent)`,
            }}
          />
        </>
      ) : null}
    </div>
  );
}

interface CoverProps {
  size?: number;
  reveal?: number;
  sat?: number;
  develop?: number;
}

/** The captured gold cover of the playing song at the film's cover slot: `sat` cools it to monochrome, `develop` brings it in from dots, `reveal` opens it as a circle. */
export function GoldCover({ size = COVER.size, reveal = 1, sat = 1, develop = 1 }: CoverProps) {
  const clip = `circle(${lerp(0, 78, ease.out(reveal))}% at 50% 50%)`;
  return (
    <div style={{ position: "relative", width: size, height: size, clipPath: reveal >= 1 ? undefined : clip }}>
      <PlateWindow
        src={filmPlate("lyrics-full/word-04-0")}
        box={COVER_PLATE}
        x={0}
        y={0}
        width={size}
        filter={`saturate(${sat.toFixed(3)}) brightness(${lerp(1.18, 1.04, sat).toFixed(3)})`}
      />
      {develop < 1 ? <TileVeil box={{ x: 0, y: 0, w: size, h: size }} develop={develop} /> : null}
    </div>
  );
}

interface ChipProps {
  text: string;
  from: number;
  out?: number;
  y?: number;
  size?: number;
  lit?: boolean;
}

/** The burned-in caption: lowercase mono, hairline, 44 px, rising out of a clipped box inside the safe box. */
export function CutChip({ text, from, out, y = CHIP_Y, size = 44, lit = false }: ChipProps) {
  const frame = useCurrentFrame();
  const entering = ramp(frame, from, 10);
  const leaving = out === undefined ? 0 : ramp(frame, out, 8, ease.in);
  if (entering <= 0 || leaving >= 1) return null;
  const rise = leaving > 0 ? lerp(0, -120, leaving) : lerp(120, 0, entering);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center" }}>
      <div style={{ overflow: "hidden", paddingBottom: 2 }}>
        <div
          data-legible={entering >= 1 && leaving <= 0 ? "" : undefined}
          style={{
            transform: `translateY(${rise}%)`,
            fontFamily: "var(--font-mono)",
            fontSize: size,
            letterSpacing: "0.02em",
            color: lit ? "var(--ignite)" : "var(--foreground)",
            background: "color-mix(in oklch, var(--background) 90%, transparent)",
            border: "2px solid color-mix(in oklch, var(--foreground) 36%, transparent)",
            padding: "12px 28px",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

interface StampProps {
  labels: readonly string[];
  at: number;
  out?: number;
  y: number;
  size?: number;
}

export function Stamp({ labels, at: strike, out, y, size = 110 }: StampProps) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, strike - 6, 6);
  const leave = out === undefined ? 0 : ramp(frame, out, 6, ease.in);
  if (rise <= 0 || leave >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          gap: 18,
          paddingBottom: 10,
          transform: `translateY(${leave > 0 ? lerp(0, -130, leave) : lerp(130, 0, rise)}%)`,
        }}
      >
        {labels.map((label) => (
          <Keycap
            key={label}
            label={label}
            size={size}
            bright
            press={pressAt(frame, strike, 3, 8)}
            legible={rise >= 1 && leave <= 0}
            wide={label.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

export function Hit({ at: from, strength = 0.22 }: { at: number; strength?: number }) {
  const frame = useCurrentFrame();
  const level = ramp(frame, from, 2) * (1 - ramp(frame, from + 2, 12));
  if (level <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, background: `rgb(255 255 255 / ${strength * level})` }} />;
}
