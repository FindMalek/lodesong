import { Video } from "@remotion/media";
import type { CSSProperties, ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import ogAlbum from "../../../../docs/og-album.jpg";
import ogArtist from "../../../../docs/og-artist.jpg";
import ogSong from "../../../../docs/og-song.jpg";
import { videoSrc } from "../captures/film-manifest";
import { gold } from "../design/gold";
import { ease, lerp, ramp } from "../design/motion";
import { FlashChip, PlateFlash } from "../ui/s11-flash";
import { type Flash, flashFrames, S11_FLASHES } from "./s11-plan";

const CARD = { w: 1200, h: 630 };

const CARDS = [
  { src: ogAlbum, x: 64, y: 70, at: 0, gold: false },
  { src: ogArtist, x: 330, y: 230, at: 9, gold: false },
  { src: ogSong, x: 640, y: 380, at: 18, gold: true },
] as const;

function CardsFlash({ frame }: { frame: number }) {
  return (
    <>
      {CARDS.map((card) => {
        const p = ramp(frame, card.at, 7);
        return (
          <div
            key={card.x}
            style={{
              position: "absolute",
              left: card.x,
              top: card.y,
              width: CARD.w,
              height: CARD.h,
              background: "#000",
              isolation: "isolate",
              border: card.gold ? "2px solid var(--ignite)" : "1px solid color-mix(in oklch, var(--foreground) 35%, transparent)",
              opacity: p > 0 ? 1 : 0,
              transform: `translate(${lerp(90, 0, p)}px, ${lerp(60, 0, p)}px)`,
            }}
          >
            <Img
              src={card.src}
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                filter: card.gold ? "grayscale(1) contrast(1.45) brightness(1)" : "grayscale(1) brightness(0.8)",
              }}
            />
            {card.gold ? <div style={{ position: "absolute", inset: 0, background: "var(--ignite)", mixBlendMode: "multiply" }} /> : null}
          </div>
        );
      })}
    </>
  );
}

function ScrollFlash({ frames, frame }: { frames: number; frame: number }) {
  const t = ramp(frame, 0, frames, ease.out);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${lerp(1.2, 1.45, t)})`, transformOrigin: "45% 40%" }}>
      <Video src={videoSrc("scroll-10k")} muted playbackRate={2.2} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function ReadOnly({ frame }: { frame: number }) {
  const tag = ramp(frame, 14, 8);
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

function Split({ flash, frames, frame }: { flash: Flash; frames: number; frame: number }) {
  const right = flash.right;
  if (!right) return null;
  const half = (side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    inset: 0,
    clipPath: side === "left" ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)",
  });
  return (
    <>
      <div style={half("left")}>
        <PlateFlash
          take={flash.take ?? ""}
          plate={flash.plate ?? ""}
          focus={flash.focus}
          scale={flash.scale}
          frames={frames}
          frame={frame}
        />
      </div>
      <div style={half("right")}>
        <div style={{ position: "absolute", inset: 0, transform: "translateX(960px)" }}>
          <PlateFlash take={right.take} plate={right.plate} focus={right.focus} scale={right.scale} frames={frames} frame={frame} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 959, top: 0, width: 2, height: 1080, background: "var(--ignite)" }} />
      <FlashChip icon={right.icon} text={right.chip} frame={frame} at={5} left={1024} />
    </>
  );
}

function body(flash: Flash, frames: number, frame: number): ReactNode {
  if (flash.kind === "split") return <Split flash={flash} frames={frames} frame={frame} />;
  if (flash.kind === "plate")
    return (
      <PlateFlash
        take={flash.take ?? ""}
        plate={flash.plate ?? ""}
        focus={flash.focus}
        scale={flash.scale}
        bright={flash.bright}
        frames={frames}
        frame={frame}
      />
    );
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
      <FlashChip icon={flash.icon} text={flash.chip} frame={frame} />
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
