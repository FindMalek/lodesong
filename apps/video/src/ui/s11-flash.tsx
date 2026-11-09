import { Disc3, ListMusic, Lock, Mic, MonitorSmartphone, Plane, Rows3, Share2, Stethoscope, Sun, Users } from "lucide-react";
import { plateSrc } from "../captures/film-manifest";
import { Camera } from "../design/camera";
import { ease, lerp, ramp } from "../design/motion";
import { camToBox, Plate, plateLayout } from "../design/plate";
import type { Box } from "../design/probe";

const LAYOUT = plateLayout({ w: 1440, h: 810 });
const WHOLE: Box = { x: 0, y: 0, w: 1440, h: 810 };

export type FlashIcon = "plane" | "share" | "sun" | "rows" | "users" | "lock" | "doctor" | "queue" | "lyrics" | "mixes" | "devices";

const ICONS: Record<FlashIcon, typeof Plane> = {
  plane: Plane,
  share: Share2,
  sun: Sun,
  rows: Rows3,
  users: Users,
  lock: Lock,
  doctor: Stethoscope,
  queue: ListMusic,
  lyrics: Mic,
  mixes: Disc3,
  devices: MonitorSmartphone,
};

/** A lowercase mono chip on a dark plate, anchored bottom left: the one label a flash carries. */
export function FlashChip({
  icon,
  text,
  frame,
  at = 2,
  left = 64,
}: {
  icon: FlashIcon;
  text: string;
  frame: number;
  at?: number;
  left?: number;
}) {
  const Icon = ICONS[icon];
  const rise = ramp(frame, at, 6);
  return (
    <div
      data-legible=""
      style={{
        position: "absolute",
        left,
        bottom: 64,
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "20px 32px",
        background: "rgb(0 0 0 / 0.86)",
        border: "1px solid color-mix(in oklch, var(--foreground) 40%, transparent)",
        color: "#f4f4f4",
        fontFamily: "var(--font-mono)",
        fontSize: 46,
        letterSpacing: "0.03em",
        opacity: rise,
        transform: `translateY(${lerp(18, 0, rise)}px)`,
      }}
    >
      <Icon size={48} strokeWidth={1.75} aria-hidden />
      {text}
    </div>
  );
}

interface PlateFlashProps {
  take: string;
  plate: string;
  focus?: Box | undefined;
  scale?: readonly [number, number] | undefined;
  bright?: boolean | undefined;
  frames: number;
  frame: number;
}

/** A capture plate, big and lit, with a slow push from one scale to the next over the whole flash. */
export function PlateFlash({ take, plate, focus = WHOLE, scale = [1.3, 1.5], bright = false, frames, frame }: PlateFlashProps) {
  const a = camToBox(LAYOUT, focus, { scale: scale[0] });
  const b = camToBox(LAYOUT, focus, { scale: scale[1] });
  const t = ramp(frame, 0, frames, ease.out);
  const cam = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), scale: lerp(a.scale, b.scale, t), rx: 0, ry: 0 };
  return (
    <Camera cam={cam}>
      <Plate
        src={plateSrc(take, plate)}
        layout={LAYOUT}
        brightness={bright ? 1 : 2}
        {...(bright ? {} : { light: { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2, radius: 760, dim: 0.75, wash: 0.02 } })}
      />
    </Camera>
  );
}
