import type { CSSProperties, ReactNode } from "react";
import { Img, OffthreadVideo } from "remotion";
import { type CamKey, type CamToOptions, camTo, PERSPECTIVE, STAGE, type Stage } from "./camera";
import { defocus } from "./dof";
import { LightPool, type Pool } from "./light-pool";
import type { Box } from "./probe";

/** App captures are 1440x900 CSS px at device scale 2; every box and overlay is in those px. */
const PLATE_SIZE: Stage = { w: 1440, h: 900 };

export interface PlateLayout {
  k: number;
  left: number;
  top: number;
  size: Stage;
  stage: Stage;
}

export function plateLayout(size: Stage = PLATE_SIZE, stage: Stage = STAGE, fit: "cover" | "contain" = "cover"): PlateLayout {
  const pick = fit === "cover" ? Math.max : Math.min;
  const k = pick(stage.w / size.w, stage.h / size.h);
  return { k, left: (stage.w - size.w * k) / 2, top: (stage.h - size.h * k) / 2, size, stage };
}

const toStage = (layout: PlateLayout, p: { x: number; y: number }): { x: number; y: number } => ({
  x: layout.left + p.x * layout.k,
  y: layout.top + p.y * layout.k,
});

const boxToStage = (layout: PlateLayout, box: Box): Box => ({
  ...toStage(layout, box),
  w: box.w * layout.k,
  h: box.h * layout.k,
});

const EDGE_MARGIN = 24;

const LIFT = 1.5;

function clampAxis(center: number, half: number, from: number, to: number): number {
  const lo = from + half + EDGE_MARGIN;
  const hi = to - half - EDGE_MARGIN;
  return lo > hi ? (from + to) / 2 : Math.min(hi, Math.max(lo, center));
}

/** Camera that frames a captured element (box in plate px); the frame never leaves the plate. */
export function camToBox(layout: PlateLayout, box: Box, options: CamToOptions = {}) {
  const cam = camTo(boxToStage(layout, box), { stage: layout.stage, ...options });
  const { stage, size, left, top, k } = layout;
  const cx = clampAxis(stage.w / 2 + cam.x / cam.scale, stage.w / (2 * cam.scale), left, left + size.w * k);
  const cy = clampAxis(stage.h / 2 + cam.y / cam.scale, stage.h / (2 * cam.scale), top, top + size.h * k);
  return { ...cam, x: (cx - stage.w / 2) * cam.scale, y: (cy - stage.h / 2) * cam.scale };
}

export interface PlateStop extends CamToOptions {
  at: number;
  box: Box;
}

export function plateKeys(layout: PlateLayout, stops: readonly PlateStop[]): CamKey[] {
  return stops.map(({ at, box, ...options }) => ({ at, ...camToBox(layout, box, options) }));
}

export interface PlateSlice {
  name: string;
  box: Box;
  z: number;
}

interface PlateProps {
  src: string;
  layout?: PlateLayout;
  slices?: readonly PlateSlice[];
  focusZ?: number;
  aperture?: number;
  light?: Pool;
  brightness?: number;
  children?: ReactNode;
}

const VIDEO = /\.(mp4|webm|mov)$/i;

const planeFill: CSSProperties = { position: "absolute", inset: 0 };

function Media({ src }: { src: string }) {
  const style: CSSProperties = { width: "100%", height: "100%", display: "block" };
  return VIDEO.test(src) ? <OffthreadVideo src={src} muted style={style} /> : <Img src={src} style={style} />;
}

/** A plane at depth z that still lines up with the base plate at a neutral camera (cancels the perspective scale). */
function Plane({ z, layout, children, style }: { z: number; layout: PlateLayout; children: ReactNode; style?: CSSProperties }) {
  const cx = (layout.stage.w / 2 - layout.left) / layout.k;
  const cy = (layout.stage.h / 2 - layout.top) / layout.k;
  return (
    <div
      style={{
        ...planeFill,
        transformStyle: "preserve-3d",
        transformOrigin: `${cx}px ${cy}px`,
        transform: `translateZ(${z}px) scale(${(PERSPECTIVE - z) / PERSPECTIVE})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function clipOf(box: Box, size: Stage): string {
  return `inset(${box.y}px ${size.w - box.x - box.w}px ${size.h - box.y - box.h}px ${box.x}px)`;
}

/** A captured app screen as a camera subject, inside `Camera`. Slices lift panels to their own depth; overlays stay pixel-registered. */
export function Plate({
  src,
  layout = plateLayout(),
  slices = [],
  focusZ = 0,
  aperture = 0.03,
  light,
  brightness = LIFT,
  children,
}: PlateProps) {
  const surface = (z: number, clip?: Box) => {
    const blur = defocus(z, focusZ, aperture);
    const filters = [brightness === 1 ? "" : `brightness(${brightness})`, blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : ""];
    const content = <Media src={src} />;
    return (
      <div style={{ ...planeFill, clipPath: clip ? clipOf(clip, layout.size) : undefined, filter: filters.join(" ").trim() || undefined }}>
        {light ? <LightPool {...light}>{content}</LightPool> : content}
      </div>
    );
  };
  const top = Math.max(0, ...slices.map((slice) => slice.z)) + 2;
  return (
    <div
      style={{
        position: "absolute",
        left: layout.left,
        top: layout.top,
        width: layout.size.w,
        height: layout.size.h,
        transformStyle: "preserve-3d",
        transformOrigin: "0 0",
        transform: `scale(${layout.k})`,
      }}
    >
      {surface(0)}
      {slices.map((slice) => (
        <Plane key={slice.name} z={slice.z} layout={layout}>
          {surface(slice.z, slice.box)}
        </Plane>
      ))}
      {children ? (
        <Plane z={top} layout={layout}>
          {children}
        </Plane>
      ) : null}
    </div>
  );
}
