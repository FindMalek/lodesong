import { Video } from "@remotion/media";
import { Lock, Palette, Plane, Rows3, Share2, Stethoscope, Sun, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import ogAlbum from "../../../../docs/og-album.jpg";
import ogArtist from "../../../../docs/og-artist.jpg";
import ogSong from "../../../../docs/og-song.jpg";
import { plateSrc, videoSrc } from "../captures/film-manifest";
import { Camera } from "../design/camera";
import { gold } from "../design/gold";
import { ease, lerp, ramp } from "../design/motion";
import { camToBox, Plate, plateLayout } from "../design/plate";
import { type Flash, type FlashIcon, flashFrames, S11_FLASHES } from "./s11-plan";

const LAYOUT = plateLayout({ w: 1440, h: 810 });
const ICONS: Record<FlashIcon, typeof Plane> = {
  plane: Plane,
  share: Share2,
  sun: Sun,
  rows: Rows3,
  users: Users,
  palette: Palette,
  doctor: Stethoscope,
  lock: Lock,
};
const CARD = { w: 1200, h: 630 };

function Chip({ flash, frame }: { flash: Flash; frame: number }) {
  const Icon = ICONS[flash.icon];
  const rise = ramp(frame, 2, 6);
  return (
    <div
      data-legible=""
      style={{
        position: "absolute",
        left: 64,
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
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        opacity: rise,
        transform: `translateY(${lerp(18, 0, rise)}px)`,
      }}
    >
      <Icon size={48} strokeWidth={1.75} aria-hidden />
      {flash.chip}
    </div>
  );
}

function PlateFlash({ flash, frames, frame }: { flash: Flash; frames: number; frame: number }) {
  const [from, to] = flash.scale ?? [1.3, 1.5];
  const focus = flash.focus ?? { x: 0, y: 0, w: 1440, h: 810 };
  const a = camToBox(LAYOUT, focus, { scale: from });
  const b = camToBox(LAYOUT, focus, { scale: to });
  const t = ramp(frame, 0, frames, ease.out);
  const cam = {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    rx: 0,
    ry: 0,
  };
  return (
    <Camera cam={cam}>
      <Plate
        src={plateSrc(flash.take ?? "", flash.plate ?? "")}
        layout={LAYOUT}
        brightness={flash.bright ? 1 : 1.55}
        light={flash.bright ? undefined : { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2, radius: 760, dim: 0.85, wash: 0.04 }}
      />
    </Camera>
  );
}

const CARDS = [
  { src: ogAlbum, x: 64, y: 70, at: 0 },
  { src: ogArtist, x: 330, y: 230, at: 5 },
  { src: ogSong, x: 640, y: 380, at: 10 },
] as const;

function CardsFlash({ frame }: { frame: number }) {
  return (
    <>
      {CARDS.map((card) => {
        const p = ramp(frame, card.at, 5);
        return (
          <Img
            key={card.x}
            src={card.src}
            style={{
              position: "absolute",
              left: card.x,
              top: card.y,
              width: CARD.w,
              height: CARD.h,
              border: "1px solid color-mix(in oklch, var(--foreground) 35%, transparent)",
              opacity: p > 0 ? 1 : 0,
              transform: `translate(${lerp(90, 0, p)}px, ${lerp(60, 0, p)}px)`,
            }}
          />
        );
      })}
    </>
  );
}

function ScrollFlash({ frames, frame }: { frames: number; frame: number }) {
  const t = ramp(frame, 0, frames, ease.out);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${lerp(1.3, 1.6, t)})`, transformOrigin: "45% 40%" }}>
      <Video src={videoSrc("scroll-10k")} muted playbackRate={3.2} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function ReadOnly({ frame }: { frame: number }) {
  const tag = ramp(frame, 8, 5);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 250,
        textAlign: "center",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: 232,
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}
    >
      <span style={{ color: "var(--muted-foreground)" }}>/music</span>
      <span
        style={{
          color: gold(1),
          opacity: tag,
          textShadow: `0 0 ${lerp(60, 24, tag)}px color-mix(in oklch, var(--ignite) 55%, transparent)`,
        }}
      >
        :ro
      </span>
    </div>
  );
}

function body(flash: Flash, frames: number, frame: number): ReactNode {
  if (flash.kind === "plate") return <PlateFlash flash={flash} frames={frames} frame={frame} />;
  if (flash.kind === "cards") return <CardsFlash frame={frame} />;
  if (flash.kind === "scroll") return <ScrollFlash frames={frames} frame={frame} />;
  return <ReadOnly frame={frame} />;
}

function FlashShot({ flash, frames }: { flash: Flash; frames: number }) {
  const frame = useCurrentFrame();
  const hit = flash.bright ? 0 : 0.22 * (1 - ramp(frame, 0, 4));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {body(flash, frames, frame)}
      <div style={{ position: "absolute", inset: 0, background: `rgb(255 255 255 / ${hit})` }} />
      <Chip flash={flash} frame={frame} />
    </div>
  );
}

export function YoursShot() {
  return (
    <>
      {S11_FLASHES.map((flash, i) => {
        const { from, frames } = flashFrames(i);
        return (
          <Sequence key={flash.id} from={from} durationInFrames={frames} name={flash.id}>
            <FlashShot flash={flash} frames={frames} />
          </Sequence>
        );
      })}
    </>
  );
}
