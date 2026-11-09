import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { plateSrc } from "../../captures/film-manifest";
import { type Cam, Camera, Layer, STAGE } from "../../design/camera";
import { ConnectLine } from "../../design/draw";
import { ease, hash, lerp, ramp } from "../../design/motion";
import type { Feature } from "../../features";
import type { Frac, HostSpec } from "./spec";

const DESK = { x: 90, y: 210, w: 1180, h: 664 };
const PHONE = { x: 1380, y: 150, w: 351, h: 760 };

const frame = (box: { x: number; y: number; w: number; h: number }, radius: number) => ({
  position: "absolute" as const,
  left: box.x,
  top: box.y,
  width: box.w,
  height: box.h,
  borderRadius: radius,
  overflow: "hidden" as const,
  border: "2px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
  boxShadow: "0 40px 120px rgb(0 0 0 / 0.7)",
});

/** Two real captures, the laptop and the phone, tied by a gold line that draws and carries a pulse: one session. */
export function PairScene({ frames }: { feature: Feature; frames: number }) {
  const now = useCurrentFrame();
  const t = ease.out(Math.min(1, now / (frames * 0.8)));
  const cam: Cam = { x: 0, y: 0, scale: lerp(1, 1.07, t), rx: lerp(1, 0, t), ry: lerp(-5, 2, t) };
  const grid = (n: number) => n / 30;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 55% 60% at 50% 55%, color-mix(in oklch, var(--ignite) 12%, transparent), transparent)",
        }}
      />
      <Camera cam={cam}>
        <Layer z={0}>
          <div style={frame(DESK, 14)}>
            <Img src={plateSrc("devices", "handed-off")} style={{ width: "100%", height: "100%", filter: "brightness(1.35)" }} />
          </div>
        </Layer>
        <Layer z={70}>
          <div style={frame(PHONE, 40)}>
            <Img
              src={plateSrc("devices", "phone-after")}
              style={{ width: "100%", height: "100%", filter: "brightness(1.35)", objectFit: "cover" }}
            />
          </div>
        </Layer>
        <Layer z={40}>
          <ConnectLine
            from={{ x: DESK.x + 0.85 * DESK.w, y: DESK.y + 0.95 * DESK.h }}
            to={{ x: PHONE.x, y: PHONE.y + 0.9 * PHONE.h }}
            at={grid(frames * 0.2)}
            length={grid(frames * 0.45)}
            bend={0.4}
            width={5}
            pulse={{ at: grid(frames * 0.55), length: grid(frames * 0.3) }}
            size={STAGE}
          />
        </Layer>
      </Camera>
    </AbsoluteFill>
  );
}

/** A gold line that draws itself across a chart region of the real page, the way the film draws stats. */
export function chartLine(region: Frac, seed: number): NonNullable<HostSpec["overlay"]> {
  return function Line({ asset, frame: now, frames }) {
    const [rx, ry, rw, rh] = region;
    const box = { x: rx * asset.w, y: ry * asset.h, w: rw * asset.w, h: rh * asset.h };
    const points = Array.from({ length: 28 }, (_, i) => {
      const x = box.x + (i / 27) * box.w;
      const level = 0.3 + 0.55 * hash(i * 1.9 + seed) * (0.6 + 0.4 * Math.sin(i / 4));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${(box.y + box.h * (1 - level)).toFixed(1)}`;
    }).join(" ");
    const progress = ramp(now, frames * 0.12, frames * 0.55, ease.inOut);
    return (
      <svg
        aria-hidden
        width={asset.w}
        height={asset.h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", filter: "drop-shadow(0 0 14px var(--ignite))" }}
      >
        <path
          d={points}
          pathLength={1}
          fill="none"
          stroke="var(--ignite)"
          strokeWidth={Math.max(6, asset.w / 260)}
          strokeLinejoin="round"
          strokeDasharray="1 1"
          strokeDashoffset={1 - progress}
        />
      </svg>
    );
  };
}
