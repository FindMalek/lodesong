import type { CSSProperties, ReactNode } from "react";
import { Img, Sequence, staticFile, useCurrentFrame } from "remotion";

import { lerp, ramp } from "../design/motion";
import { FlashChip, PlateFlash } from "../ui/s11-flash";
import { ServerFlow } from "../ui/s11-server";
import { type Flash, flashFrames, S11_FLASHES } from "./s11-plan";

const ogAlbum = staticFile("docs/og-album.jpg");
const ogArtist = staticFile("docs/og-artist.jpg");
const ogSong = staticFile("docs/og-song.jpg");

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
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 1300px 700px at 50% 46%, color-mix(in oklch, var(--ignite) 34%, #0b0b0b), color-mix(in oklch, var(--ignite) 10%, #0b0b0b) 62%, #0b0b0b 90%)",
        }}
      />
      <ServerFlow frame={frame} />
    </>
  );
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
