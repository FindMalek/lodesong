import type { CSSProperties, ReactNode } from "react";
import { Sequence } from "remotion";
import { gridBeat as beat } from "./beat";
import { ease, lerp } from "./motion";
import type { Box } from "./probe";

export interface Cam {
  x: number;
  y: number;
  scale: number;
  rx: number;
  ry: number;
}

export interface CamKey extends Partial<Cam> {
  at: number;
}

const CAM0: Cam = { x: 0, y: 0, scale: 1, rx: 0, ry: 0 };

const FIELDS = ["x", "y", "scale", "rx", "ry"] as const;

function track(frame: number, keys: readonly CamKey[], field: keyof Cam, easing: (t: number) => number): number {
  const set = keys.filter((key) => key[field] !== undefined);
  const first = set[0];
  if (!first || frame <= beat(first.at)) return first?.[field] ?? CAM0[field];
  for (let i = 0; i < set.length - 1; i += 1) {
    const a = set[i];
    const b = set[i + 1];
    if (!a || !b) continue;
    if (frame < beat(b.at)) return lerp(a[field] ?? 0, b[field] ?? 0, easing((frame - beat(a.at)) / (beat(b.at) - beat(a.at))));
  }
  return set.at(-1)?.[field] ?? CAM0[field];
}

/** Keyframed camera in beats: each field is eased between its own keys and holds after the last one. */
export function camAt(frame: number, keys: readonly CamKey[], easing: (t: number) => number = ease.inOut): Cam {
  const cam: Cam = { ...CAM0 };
  for (const field of FIELDS) cam[field] = track(frame, keys, field, easing);
  return cam;
}

export const PERSPECTIVE = 2200;

/** Where to draw something on a layer at depth z so it appears at screen point (ax, ay) once perspective has scaled it. */
export function atDepth(ax: number, ay: number, z: number, cx: number, cy: number): { x: number; y: number; k: number } {
  const k = PERSPECTIVE / (PERSPECTIVE - z);
  return { x: cx + (ax - cx) / k, y: cy + (ay - cy) / k, k };
}

/** 2.5D rig: children on `Layer`s at different depths shift against each other when the camera moves or turns. */
export function Camera({ cam, children, origin = "50% 50%" }: { cam: Cam; children: ReactNode; origin?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, perspective: PERSPECTIVE, perspectiveOrigin: origin }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transformOrigin: origin,
          transform: `translate3d(${-cam.x}px, ${-cam.y}px, 0) scale(${cam.scale}) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Layer({ z = 0, style, children }: { z?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `translateZ(${z}px)`, ...style }}>
      {children}
    </div>
  );
}

export interface Stage {
  w: number;
  h: number;
}

export const STAGE: Stage = { w: 1920, h: 1080 };

export interface CamToOptions {
  stage?: Stage;
  fill?: number;
  scale?: number;
  minScale?: number;
  maxScale?: number;
  rx?: number;
  ry?: number;
}

export function camTo(box: Box, options: CamToOptions = {}): Cam {
  const { stage = STAGE, fill = 0.6, minScale = 1, maxScale = 4, rx = 0, ry = 0 } = options;
  const fit = Math.min((stage.w * fill) / box.w, (stage.h * fill) / box.h);
  const scale = Math.min(maxScale, Math.max(minScale, options.scale ?? fit));
  return {
    x: scale * (box.x + box.w / 2 - stage.w / 2),
    y: scale * (box.y + box.h / 2 - stage.h / 2),
    scale,
    rx,
    ry,
  };
}

export function handheld(frame: number, amount = 1): Pick<Cam, "x" | "y" | "rx" | "ry"> {
  return {
    x: amount * (3 * Math.sin(frame * 0.021) + 1.5 * Math.sin(frame * 0.057 + 1)),
    y: amount * (2.4 * Math.sin(frame * 0.017 + 2) + 1.2 * Math.sin(frame * 0.049)),
    rx: amount * 0.12 * Math.sin(frame * 0.019 + 0.5),
    ry: amount * 0.15 * Math.sin(frame * 0.023 + 1.1),
  };
}

export function addCam(cam: Cam, delta: Partial<Cam>): Cam {
  return {
    x: cam.x + (delta.x ?? 0),
    y: cam.y + (delta.y ?? 0),
    scale: cam.scale * (delta.scale ?? 1),
    rx: cam.rx + (delta.rx ?? 0),
    ry: cam.ry + (delta.ry ?? 0),
  };
}

interface CameraBlurProps {
  shutter?: number;
  samples?: number;
  active?: boolean;
  backdrop?: string;
  children: ReactNode;
}

/** Motion blur by averaging sub-frame copies of the subtree; turn off for probe or still renders. */
export function CameraBlur({ shutter = 0.5, samples = 8, active = true, backdrop = "#000", children }: CameraBlurProps) {
  if (!active || samples < 2) return children;
  return (
    <>
      {Array.from({ length: samples }, (_, i) => {
        const offset = (i / (samples - 1) - 0.5) * shutter;
        return (
          <div key={offset} data-blur-sample="" style={{ position: "absolute", inset: 0, opacity: 1 / (i + 1), background: backdrop }}>
            <Sequence layout="none" from={-offset}>
              {children}
            </Sequence>
          </div>
        );
      })}
    </>
  );
}
