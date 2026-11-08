import type { CSSProperties, ReactNode } from "react";
import { beat } from "./beat";
import { ease, lerp } from "./motion";

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

export const CAM0: Cam = { x: 0, y: 0, scale: 1, rx: 0, ry: 0 };

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
