import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { beat } from "./beat";
import { Layer } from "./camera";
import { ease, hash, lerp } from "./motion";

export interface FocusKey {
  at: number;
  z: number;
}

/** Focus distance in beats: eased between keys, held after the last. */
export function focusAt(frame: number, keys: readonly FocusKey[]): number {
  const first = keys[0];
  if (!first) return 0;
  if (frame <= beat(first.at)) return first.z;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a && b && frame < beat(b.at)) return lerp(a.z, b.z, ease.inOut((frame - beat(a.at)) / (beat(b.at) - beat(a.at))));
  }
  return keys.at(-1)?.z ?? first.z;
}

export const defocus = (z: number, focusZ: number, aperture = 0.04, max = 28): number => Math.min(max, Math.abs(z - focusZ) * aperture);

const blurOf = (px: number): string | undefined => (px > 0.3 ? `blur(${px.toFixed(2)}px)` : undefined);

interface DofLayerProps {
  z: number;
  focusZ: number;
  aperture?: number;
  style?: CSSProperties;
  children?: ReactNode;
}

export function DofLayer({ z, focusZ, aperture, style, children }: DofLayerProps) {
  return (
    <Layer z={z} style={{ filter: blurOf(defocus(z, focusZ, aperture)), ...style }}>
      {children}
    </Layer>
  );
}

interface BokehProps {
  focusZ: number;
  z?: number;
  count?: number;
  seed?: number;
  aperture?: number;
  speed?: number;
  width?: number;
  height?: number;
  opacity?: number;
}

const DOTS = "radial-gradient(circle, #000 52%, rgb(0 0 0 / 0.45) 58%)";

/** Gold dithered bokeh discs that drift across the foreground and sharpen when focus racks to them. */
export function Bokeh({
  focusZ,
  z = 300,
  count = 16,
  seed = 1,
  aperture = 0.07,
  speed = -0.9,
  width = 1920,
  height = 1080,
  opacity = 0.34,
}: BokehProps) {
  const frame = useCurrentFrame();
  const filter = blurOf(defocus(z, focusZ, aperture));
  return (
    <Layer z={z}>
      {Array.from({ length: count }, (_, i) => {
        const r = 34 + hash(i * 5 + seed) * 92;
        const span = width + r * 2;
        const travel = hash(i * 3 + seed * 11) * span + frame * speed * (0.6 + hash(i + seed) * 0.9);
        const x = (((travel % span) + span) % span) - r;
        const alpha = opacity * (0.45 + hash(i * 13 + seed) * 0.55);
        const gold = (pct: number): string => `color-mix(in oklch, var(--ignite) ${Math.round(alpha * pct)}%, transparent)`;
        return (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list, never reordered
            key={i}
            style={{ position: "absolute", left: x - r, top: hash(i * 7 + seed * 5) * height - r, width: r * 2, height: r * 2, filter }}
          >
            <i
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${gold(70)} 0%, ${gold(100)} 66%, ${gold(240)} 90%, transparent 100%)`,
                maskImage: DOTS,
                maskSize: "7px 7px",
                WebkitMaskImage: DOTS,
                WebkitMaskSize: "7px 7px",
              }}
            />
          </i>
        );
      })}
    </Layer>
  );
}
