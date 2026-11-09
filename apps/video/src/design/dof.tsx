import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { gridBeat as beat } from "./beat";
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

const DOTS = "radial-gradient(circle, #000 60%, rgb(0 0 0 / 0.55) 66%)";

/** Gold dithered bokeh discs that drift across the foreground and sharpen when focus racks to them. */
export function Bokeh({
  focusZ,
  z = 300,
  count = 24,
  seed = 1,
  aperture = 0.07,
  speed = -0.9,
  width = 1920,
  height = 1080,
  opacity = 0.3,
}: BokehProps) {
  const frame = useCurrentFrame();
  const filter = blurOf(defocus(z, focusZ, aperture));
  return (
    <Layer z={z}>
      {Array.from({ length: count }, (_, i) => {
        const speck = i % 3 === 0;
        const r = speck ? 7 + hash(i * 9 + seed) * 9 : 20 + hash(i * 5 + seed) ** 1.6 * 120;
        const span = width + r * 2;
        const travel = hash(i * 3 + seed * 11) * span + frame * speed * (0.6 + hash(i + seed) * 0.9);
        const x = (((travel % span) + span) % span) - r;
        const y = hash(i * 7 + seed * 5) * height + Math.sin(frame * 0.012 + i) * 14 - r;
        const alpha = opacity * (0.5 + hash(i * 13 + seed) * 0.8) * (speck ? 2.2 : 1);
        const tint = hash(i * 17 + seed) > 0.5 ? "var(--ignite)" : "color-mix(in oklch, var(--ignite) 82%, white)";
        const tone = (pct: number): string => `color-mix(in oklch, ${tint} ${Math.min(100, Math.round(alpha * pct))}%, transparent)`;
        return (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list, never reordered
            key={i}
            style={{ position: "absolute", left: x - r, top: y, width: r * 2, height: r * 2, filter, mixBlendMode: "plus-lighter" }}
          >
            <i
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: speck
                  ? `radial-gradient(circle, ${tone(100)} 0%, ${tone(80)} 55%, transparent 100%)`
                  : `radial-gradient(circle, ${tone(40)} 0%, ${tone(55)} 62%, ${tone(150)} 88%, ${tone(30)} 96%, transparent 100%)`,
                maskImage: speck ? undefined : DOTS,
                maskSize: "5px 5px",
                WebkitMaskImage: speck ? undefined : DOTS,
                WebkitMaskSize: "5px 5px",
              }}
            />
          </i>
        );
      })}
    </Layer>
  );
}
