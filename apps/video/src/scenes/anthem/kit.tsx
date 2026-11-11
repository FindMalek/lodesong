import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { ease, lerp, ramp } from "../../design/motion";
import type { Box } from "../../design/probe";

/** The anthem runs on one constant grid: 120 bpm, 30 frames a beat, so every number here is a beat or a frame of it. */
export const B = 30;
export const GOLD = "var(--ignite)";
const PLATE = { w: 1440, h: 810 };
const STAGE_W = 1920;

/** What the camera sees of a plate, in plate px; the height follows from 16:9. */
export interface View {
  x: number;
  y: number;
  w: number;
}

export interface ViewKey {
  at: number;
  view: View;
}

function viewAt(frame: number, keys: readonly ViewKey[], easing: (t: number) => number = ease.inOut): View {
  const first = keys[0];
  if (!first) return { x: 0, y: 0, w: PLATE.w };
  if (frame <= first.at * B) return first.view;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (!a || !b || frame >= b.at * B) continue;
    const t = easing((frame - a.at * B) / ((b.at - a.at) * B));
    return { x: lerp(a.view.x, b.view.x, t), y: lerp(a.view.y, b.view.y, t), w: lerp(a.view.w, b.view.w, t) };
  }
  return keys.at(-1)?.view ?? first.view;
}

const viewScale = (view: View): number => STAGE_W / view.w;

interface PlateCut {
  src: string;
  from: number;
}

interface PlateShotProps {
  plates: readonly PlateCut[];
  keys: readonly ViewKey[];
  children?: ReactNode;
  background?: string;
  ease?: "in" | "inOut";
}

const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

/** A real capture, full bleed, never dimmed or blurred: the camera is a crop that glides, the plates swap on the frame the app changes. */
export function PlateShot({ plates, keys, children, background = "#0d0d0d", ease: curve = "inOut" }: PlateShotProps) {
  const frame = useCurrentFrame();
  const view = viewAt(frame, keys, ease[curve]);
  const scale = viewScale(view);
  const current = plates.findLastIndex((plate) => frame >= plate.from);
  return (
    <AbsoluteFill style={{ background, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: PLATE.w,
          height: PLATE.h,
          transformOrigin: "0 0",
          transform: `translate(${-view.x * scale}px, ${-view.y * scale}px) scale(${scale})`,
        }}
      >
        {plates.map((plate, i) => (
          <Img key={`${plate.src}-${plate.from}`} src={plate.src} style={{ ...fill, opacity: i === Math.max(0, current) ? 1 : 0 }} />
        ))}
        {children}
      </div>
    </AbsoluteFill>
  );
}

/** The same piece at any size, in screen px. */
export function Lifted({ src, box, width, style }: { src: string; box: Box; width: number; style?: CSSProperties }) {
  const k = width / box.w;
  return (
    <div
      style={{
        width,
        height: box.h * k,
        backgroundImage: `url(${src})`,
        backgroundSize: `${PLATE.w * k}px ${PLATE.h * k}px`,
        backgroundPosition: `${-box.x * k}px ${-box.y * k}px`,
        ...style,
      }}
    />
  );
}

const CELL = 26;
const FULL = 19;

/** A dot lattice as a mask: at 0 nothing shows, at 1 everything does, and in between the picture is made of growing dots. */
export function dotMask(progress: number): CSSProperties {
  if (progress >= 1) return {};
  const radius = Math.max(0, progress) * FULL;
  const image = `radial-gradient(circle at center, #000 ${radius.toFixed(2)}px, transparent ${(radius + 0.8).toFixed(2)}px)`;
  return { maskImage: image, WebkitMaskImage: image, maskSize: `${CELL}px ${CELL}px`, WebkitMaskSize: `${CELL}px ${CELL}px` };
}

export const LAP = 9;

/** How a shot arrives: its picture condenses out of dots over the last frames of the shot before it. */
export function DotIn({ children, length = LAP }: { children: ReactNode; length?: number }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={dotMask(ramp(frame, 0, length, ease.inOut))}>{children}</AbsoluteFill>;
}

interface SayProps {
  text: string;
  from: number;
  to?: number;
  x?: number;
  y?: number;
  size?: number;
  scrim?: boolean;
}

/** The film's own voice: a few big words, one line at a time, no box around them. */
export function Say({ text, from, to, x = 96, y = 868, size = 92, scrim = true }: SayProps) {
  const frame = useCurrentFrame();
  const leaving = to === undefined ? 0 : ramp(frame, to, 8, ease.in);
  if (frame < from || leaving >= 1) return null;
  const words = text.split(" ");
  return (
    <>
      {scrim ? (
        <div
          style={{
            position: "absolute",
            inset: "56% 0 0 0",
            opacity: ramp(frame, from, 10) * (1 - leaving),
            background: "linear-gradient(to top, rgb(0 0 0 / 0.94) 34%, rgb(0 0 0 / 0))",
          }}
        />
      ) : null}
      <div
        style={{ position: "absolute", left: x, top: y, display: "flex", gap: size * 0.26, overflow: "hidden", paddingBottom: size * 0.16 }}
      >
        {words.map((word, i) => {
          const rise = ramp(frame, from + i * 4, 12);
          return (
            <div
              key={`${word}-${String(i)}`}
              data-legible={rise >= 1 && leaving <= 0 ? "" : undefined}
              style={{
                transform: `translateY(${lerp(112, 0, rise) - leaving * 112}%)`,
                fontSize: size,
                fontWeight: 560,
                letterSpacing: "-0.045em",
                lineHeight: 1,
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              {word}
            </div>
          );
        })}
      </div>
    </>
  );
}
