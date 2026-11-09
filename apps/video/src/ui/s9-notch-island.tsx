import type { CSSProperties, ReactNode } from "react";
import { staticFile } from "remotion";

const compact = staticFile("docs/macos/compact.png");
const open = staticFile("docs/macos/open.png");
const peek = staticFile("docs/macos/peek.png");

import { ease, lerp, ramp } from "../design/motion";
import { filmPlate, RealCrop } from "./s8-real-crop";

export const ASSET = { w: 1280, h: 520 };

interface Shape {
  w: number;
  h: number;
  r: number;
}

const SHAPES: readonly Shape[] = [
  { w: 608, h: 76, r: 26 },
  { w: 776, h: 332, r: 38 },
  { w: 1016, h: 492, r: 42 },
];
const NOTCH: Shape = { w: 232, h: 66, r: 22 };
const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };
const PLATE = { w: 1440, h: 810 };
const GREY = "#9a9a9a";
const FONT: CSSProperties = { fontFamily: "var(--font-sans)", fontWeight: 650, whiteSpace: "nowrap" };

export interface IslandState {
  p: number;
  hide: number;
  progress: number;
  played: string;
  left: string;
  bars: readonly number[];
  press: number;
  title: string;
  artist: string;
}

function shapeAt(p: number, hide: number): Shape {
  const i = Math.min(1, Math.floor(Math.max(0, p)));
  const a = SHAPES[i] ?? NOTCH;
  const b = SHAPES[i + 1] ?? a;
  const t = Math.min(1, Math.max(0, p - i));
  const base = { w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r, b.r, t) };
  return { w: lerp(base.w, NOTCH.w, hide), h: lerp(base.h, NOTCH.h, hide), r: lerp(base.r, NOTCH.r, hide) };
}

const patch = (x: number, y: number, w: number, h: number): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
  height: h,
  background: "#000",
});

function Cover({ size, radius }: { size: number; radius: number }): ReactNode {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
      <RealCrop src={filmPlate("queue/queue")} box={COVER_BOX} plate={PLATE} width={size} />
    </div>
  );
}

function Bars({ x, bottom, bars, size }: { x: number; bottom: number; bars: readonly number[]; size: number }): ReactNode {
  const gap = size * 0.28;
  return (
    <div
      style={{ position: "absolute", left: x, top: bottom - size * 3.4, display: "flex", alignItems: "flex-end", gap, height: size * 3.4 }}
    >
      {bars.map((height, i) => (
        <i
          key={String(i)}
          style={{ width: size, height: size + height * size * 2.4, borderRadius: size, background: "#fff", display: "block" }}
        />
      ))}
    </div>
  );
}

interface LayerProps {
  src: string;
  height: number;
  island: { x0: number; x1: number; h: number; r: number };
  opacity: number;
  children: ReactNode;
}

function Layer({ src, height, island, opacity, children }: LayerProps): ReactNode {
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: ASSET.w,
        height: ASSET.h,
        opacity,
        clipPath: `inset(0 ${ASSET.w - island.x1}px ${ASSET.h - island.h}px ${island.x0}px round 0 0 ${island.r}px ${island.r}px)`,
      }}
    >
      <img src={src} alt="" style={{ width: ASSET.w, height, display: "block" }} />
      {children}
    </div>
  );
}

/** The island from the real docs/macos captures, grown between compact, hover and open, with our cover, title and clock painted over the third-party ones. */
export function NotchIsland({ state, width }: { state: IslandState; width: number }): ReactNode {
  const { p, hide, progress, played, left, bars, press, title, artist } = state;
  const k = width / ASSET.w;
  const shape = shapeAt(p, hide);
  const live = 1 - hide;
  const compactOpacity = (1 - ramp(p, 0, 0.35, ease.inOut)) * live;
  const peekOpacity = ramp(p, 0.2, 0.5, ease.inOut) * (1 - ramp(p, 1, 0.3, ease.inOut)) * live;
  const openOpacity = ramp(p, 1, 0.5, ease.inOut) * live;
  const clip = `inset(0 ${(ASSET.w - shape.w) / 2}px ${ASSET.h - shape.h}px ${(ASSET.w - shape.w) / 2}px round 0 0 ${shape.r}px ${shape.r}px)`;
  return (
    <div style={{ position: "relative", width: ASSET.w, height: ASSET.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
      <div style={{ position: "absolute", inset: 0, background: "#000", clipPath: clip }}>
        <Layer src={compact} height={140} island={{ x0: 336, x1: 944, h: 76, r: 26 }} opacity={compactOpacity}>
          <div style={patch(346, 6, 64, 64)} />
          <div style={{ position: "absolute", left: 352, top: 12 }}>
            <Cover size={52} radius={12} />
          </div>
          <div style={patch(880, 16, 54, 46)} />
          <Bars x={890} bottom={52} bars={bars} size={7} />
        </Layer>
        <Layer src={peek} height={380} island={{ x0: 252, x1: 1028, h: 332, r: 38 }} opacity={peekOpacity}>
          <div style={patch(280, 84, 104, 104)} />
          <div style={{ position: "absolute", left: 288, top: 92 }}>
            <Cover size={88} radius={20} />
          </div>
          <div style={patch(392, 100, 420, 82)} />
          <div style={{ ...FONT, position: "absolute", left: 400, top: 104, fontSize: 28, color: "#ececec" }}>{title}</div>
          <div style={{ ...FONT, position: "absolute", left: 400, top: 142, fontSize: 24, fontWeight: 500, color: GREY }}>{artist}</div>
          <div style={patch(950, 112, 54, 46)} />
          <Bars x={960} bottom={148} bars={bars} size={8} />
          <div style={patch(280, 198, 80, 30)} />
          <div style={{ ...FONT, position: "absolute", left: 288, top: 202, fontSize: 21, color: GREY }}>{played}</div>
          <div
            style={{ position: "absolute", left: 372, top: 208, width: 524 * progress, height: 9, background: "#fff", borderRadius: 5 }}
          />
          <div style={patch(928, 198, 80, 30)} />
          <div style={{ ...FONT, position: "absolute", right: 1280 - 992, top: 202, fontSize: 21, color: GREY }}>{left}</div>
        </Layer>
        <Layer src={open} height={520} island={{ x0: 132, x1: 1148, h: 492, r: 42 }} opacity={openOpacity}>
          <div style={patch(160, 56, 112, 112)} />
          <div style={{ position: "absolute", left: 168, top: 64 }}>
            <Cover size={96} radius={20} />
          </div>
          <div style={patch(280, 72, 560, 84)} />
          <div style={{ ...FONT, position: "absolute", left: 288, top: 76, fontSize: 30, color: "#f2f2f2" }}>{title}</div>
          <div style={{ ...FONT, position: "absolute", left: 288, top: 116, fontSize: 25, fontWeight: 500, color: GREY }}>{artist}</div>
          <div
            style={{ position: "absolute", left: 168, top: 291, width: 944 * progress, height: 11, background: "#fff", borderRadius: 6 }}
          />
          <div style={patch(160, 306, 90, 30)} />
          <div style={{ ...FONT, position: "absolute", left: 168, top: 310, fontSize: 21, color: GREY }}>{played}</div>
          <div style={patch(1030, 306, 90, 30)} />
          <div style={{ ...FONT, position: "absolute", right: ASSET.w - 1112, top: 310, fontSize: 21, color: GREY }}>{left}</div>
          <i
            style={{
              position: "absolute",
              left: 640 - 44,
              top: 411 - 44,
              width: 88,
              height: 88,
              borderRadius: "50%",
              border: "4px solid var(--ignite)",
              opacity: press,
              boxShadow: "0 0 30px 6px var(--ignite)",
            }}
          />
        </Layer>
      </div>
    </div>
  );
}
