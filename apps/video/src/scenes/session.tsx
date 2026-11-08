import { CheckIcon, PauseIcon, RepeatIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon, SpeakerIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clock, FILM, FIXTURE } from "../copy";
import { beat, FPS } from "../design/beat";
import { atDepth, Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { glowOf, gold } from "../design/gold";
import { useLayout } from "../design/layout";
import { ease, ramp } from "../design/motion";
import { useSongSeconds } from "../design/song-clock";
import { DitherCover } from "../ui/dither-cover";
import { Phone, Window } from "../ui/frames";
import { GoldTransit } from "../ui/gold-transit";
import { SESSION } from "./timelines";

const TRACK = FIXTURE.tracks[0][1];
const PHONE_Z = 110;
const ARRIVE = { wide: { cx: 890, cy: 420, size: 300 }, tall: { cx: 540, cy: 650, size: 520 } };
const TITLE = FIXTURE.tracks[0][0].toLowerCase();

const GEOM = {
  wide: {
    win: {
      x: 100,
      y: 56,
      w: 1280,
      h: 700,
      cover: 380,
      coverX: 60,
      coverY: 60,
      textX: 480,
      title: 54,
      scrubY: 316,
      ctlY: 420,
      scrubW: 740,
      noteX: 900,
      noteY: 434,
    },
    phone: { x: 1420, y: 80, w: 410, h: 780, cover: 320, coverY: 96, title: 34, scrubY: 540, ctlY: 610, noteY: 686 },
    caption: { left: 110, top: 790, font: 92 },
    chips: { right: 170, top: 930 },
    pop: { right: 36, bottom: 40 },
  },
  tall: {
    win: {
      x: 90,
      y: 570,
      w: 900,
      h: 410,
      cover: 250,
      coverX: 32,
      coverY: 32,
      textX: 312,
      title: 42,
      scrubY: 218,
      ctlY: 272,
      scrubW: 560,
      noteX: 312,
      noteY: 156,
    },
    phone: { x: 600, y: 985, w: 380, h: 590, cover: 220, coverY: 80, title: 32, scrubY: 396, ctlY: 456, noteY: 540 },
    caption: { left: 104, top: 330, font: 112 },
    chips: { right: 90, top: 1000 },
    pop: { right: 20, bottom: 24 },
  },
} as const;

const reveal = (t: number): CSSProperties => ({ clipPath: `inset(0 0 ${(1 - t) * 100}% 0)` });

function Scrub({ x, y, w, position }: { x: number; y: number; w: number; position: number }) {
  const p = Math.min(1, position / TRACK);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w }}>
      <div style={{ position: "relative", height: 4, background: "var(--border)" }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${p * 100}%`, background: "var(--foreground)" }} />
        <div
          style={{ position: "absolute", top: -7, left: `calc(${p * 100}% - 9px)`, width: 18, height: 18, background: "var(--foreground)" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 18,
          fontFamily: "var(--font-mono)",
          fontSize: 26,
          color: "var(--muted-foreground)",
        }}
      >
        <span>{clock(position)}</span>
        <span>{clock(TRACK)}</span>
      </div>
    </div>
  );
}

function Controls({ x, y, size, playing }: { x: number; y: number; size: number; playing: boolean }) {
  const icon = size * 0.46;
  const cell = (child: ReactNode, key: string, strong = false) => (
    <div
      key={key}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: strong && playing ? "var(--foreground)" : "transparent",
        border: strong ? "1px solid var(--foreground)" : "none",
        color: strong && playing ? "var(--background)" : "var(--foreground)",
        opacity: strong || playing ? 1 : 0.55,
      }}
    >
      {child}
    </div>
  );
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: size * 0.2 }}>
      {cell(<ShuffleIcon size={icon * 0.8} />, "s")}
      {cell(<SkipBackIcon size={icon} />, "b")}
      {cell(<PauseIcon size={icon} />, "p", true)}
      {cell(<SkipForwardIcon size={icon} />, "n")}
      {cell(<RepeatIcon size={icon * 0.8} />, "r")}
    </div>
  );
}

export function SessionShot() {
  const frame = useCurrentFrame();
  const { layout } = useLayout();
  const g = GEOM[layout];
  const T = SESSION[layout];
  const time = frame / FPS;
  const position = useSongSeconds();
  const select = beat(T.select);
  const flyEnd = beat(T.flyEnd);
  const flight = ramp(frame, select, flyEnd - select, ease.inOut);
  const deskGold = 1 - ramp(frame, select, beat(0.5));
  const phoneGold = ramp(frame, flyEnd - beat(0.5), beat(0.5));
  const phoneIn = ramp(frame, beat(T.phone), beat(1.25));
  const winIn = ramp(frame, beat(T.windows), beat(1.25));
  const pickerIn = ramp(frame, beat(T.picker), beat(0.5));
  const pickerOut = ramp(frame, select + beat(0.75), beat(0.5), ease.in);
  const picked = frame >= select;
  const pulse = ramp(frame, flyEnd - beat(0.25), beat(0.25)) - ramp(frame, flyEnd, beat(1));

  const win = g.win;
  const ph = g.phone;
  const center = layout === "wide" ? { x: 960, y: 540 } : { x: 540, y: 960 };
  const from = { x: win.x + win.coverX + win.cover / 2, y: win.y + 52 + win.coverY + win.cover / 2, size: win.cover };
  const to = { x: ph.x + ph.w / 2, y: ph.y + ph.coverY + ph.cover / 2, size: ph.cover };
  const lift = atDepth(from.x, from.y, 130, center.x, center.y);
  const land = atDepth(to.x, to.y, 130, center.x, center.y);
  const arrival = ramp(frame, 0, beat(1.25), ease.inOut);
  const landed = arrival >= 1;

  const cam = camAt(
    frame,
    layout === "wide"
      ? [
          { at: 0, x: 30, ry: -9, scale: 1.04 },
          { at: T.end, x: -30, ry: 5, scale: 1.0 },
        ]
      : [
          { at: 0, y: 40, ry: 4, scale: 1.04 },
          { at: T.end, y: -20, ry: -3, scale: 1.0 },
        ],
  );

  return (
    <AbsoluteFill>
      <Camera cam={cam} origin={`${center.x}px ${center.y}px`}>
        <Layer z={-420}>
          <AbsoluteFill style={{ opacity: 0.1, maskImage: "radial-gradient(circle at 50% 45%, black 0, transparent 640px)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
              <DitherCover id="session-field" size={1080} time={time * 0.4} />
            </div>
          </AbsoluteFill>
        </Layer>

        <Layer z={0}>
          <div style={{ position: "absolute", inset: 0, ...reveal(winIn) }}>
            <Window width={win.w} height={win.h} title={FILM.session.devices[0]} style={{ left: win.x, top: win.y }}>
              <div
                style={{
                  position: "absolute",
                  left: win.coverX - 90,
                  top: win.coverY - 90,
                  width: win.cover + 180,
                  height: win.cover + 180,
                  background: glowOf(deskGold, 28),
                  opacity: landed ? 1 : 0,
                }}
              />
              <div style={{ position: "absolute", left: win.coverX, top: win.coverY, opacity: landed ? 1 : 0 }}>
                <DitherCover id="quiet-hours-ii" size={win.cover} time={time * 0.5} color={gold(deskGold)} />
              </div>
              <div
                data-legible=""
                style={{
                  position: "absolute",
                  left: win.textX,
                  top: 56,
                  fontSize: win.title,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                {TITLE}
              </div>
              <div
                data-legible=""
                style={{ position: "absolute", left: win.textX, top: 56 + win.title * 1.4, fontSize: 30, color: "var(--muted-foreground)" }}
              >
                {FIXTURE.album.artist.toLowerCase()}
              </div>
              <Scrub x={win.textX} y={win.scrubY} w={win.scrubW} position={position} />
              <Controls x={win.textX} y={win.ctlY} size={64} playing={!picked || deskGold > 0.5} />
              <div
                data-legible=""
                style={{
                  position: "absolute",
                  left: win.noteX,
                  top: win.noteY,
                  fontFamily: "var(--font-mono)",
                  fontSize: 30,
                  opacity: picked ? ramp(frame, select + beat(0.5), beat(0.5)) : 0,
                }}
              >
                {FILM.session.playingOn} {FILM.session.devices[1]}
              </div>
              <div style={{ position: "absolute", right: 28, bottom: 22, opacity: 0.8 }}>
                <SpeakerIcon size={36} />
              </div>
              <div
                style={{
                  position: "absolute",
                  right: g.pop.right,
                  bottom: g.pop.bottom + 54,
                  width: 360,
                  background: "var(--card)",
                  border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                  opacity: pickerIn * (1 - pickerOut),
                  transform: `translateY(${(1 - pickerIn) * 18 + pickerOut * 12}px)`,
                }}
              >
                {FILM.session.devices.map((device, index) => {
                  const active = picked ? index === 1 : index === 0;
                  const hit = index === 1 && picked;
                  return (
                    <div
                      key={device}
                      data-legible=""
                      style={{
                        height: 68,
                        padding: "0 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontFamily: "var(--font-mono)",
                        fontSize: 30,
                        background: hit ? "var(--foreground)" : "transparent",
                        color: hit ? "var(--background)" : "var(--foreground)",
                        borderTop: index > 0 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {device}
                      {active ? <CheckIcon size={30} /> : null}
                    </div>
                  );
                })}
              </div>
            </Window>
          </div>
        </Layer>

        <Layer z={PHONE_Z}>
          <div style={{ position: "absolute", inset: 0, ...reveal(phoneIn) }}>
            <Phone width={ph.w} height={ph.h} style={{ left: ph.x, top: ph.y }}>
              <div style={{ position: "absolute", left: (ph.w - ph.cover) / 2 - 2, top: ph.coverY, opacity: 1 }}>
                <div
                  style={{
                    position: "absolute",
                    left: -70,
                    top: -70,
                    width: ph.cover + 140,
                    height: ph.cover + 140,
                    background: glowOf(phoneGold, 30 + pulse * 20),
                  }}
                />
                <DitherCover id="quiet-hours-ii" size={ph.cover} time={time * 0.5} color={gold(phoneGold)} />
              </div>
              <div
                data-legible=""
                style={{
                  position: "absolute",
                  left: 38,
                  top: ph.coverY + ph.cover + 28,
                  fontSize: ph.title,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                {TITLE}
              </div>
              <Scrub x={38} y={ph.scrubY} w={ph.w - 80} position={position} />
              <Controls x={52} y={ph.ctlY} size={52} playing={phoneGold > 0.5} />
              <div
                style={{
                  position: "absolute",
                  left: 38,
                  top: ph.noteY,
                  width: ph.w - 76,
                  fontFamily: "var(--font-mono)",
                  fontSize: 26,
                  lineHeight: 1.3,
                  color: "var(--muted-foreground)",
                  opacity: 1 - ramp(frame, select, beat(0.5)),
                }}
              >
                {FILM.session.playingOn} {FILM.session.devices[0]}
              </div>
            </Phone>
          </div>
        </Layer>

        <Layer z={20}>
          <GoldTransit
            from={ARRIVE[layout]}
            to={{ cx: win.x + win.coverX + win.cover / 2, cy: win.y + 52 + win.coverY + win.cover / 2, size: win.cover }}
            progress={arrival}
            time={time}
          />
        </Layer>

        <Layer z={130}>
          <GoldTransit
            from={{ cx: lift.x, cy: lift.y, size: from.size / lift.k }}
            to={{ cx: land.x, cy: land.y, size: to.size / land.k }}
            progress={flight}
            time={time}
            arc={110}
          />
        </Layer>

        <Layer z={60}>
          <Caption
            lines={FILM.session.caption}
            from={beat(T.caption)}
            font={g.caption.font}
            style={{ left: g.caption.left, top: g.caption.top }}
          />
          <div
            style={{
              position: "absolute",
              display: "flex",
              gap: 14,
              ...(layout === "wide"
                ? { right: g.chips.right, top: g.chips.top }
                : { left: 90, top: g.chips.top, flexDirection: "column", alignItems: "flex-start" }),
            }}
          >
            {FILM.session.chips.map((chip, index) => (
              <div
                key={chip}
                data-legible=""
                style={{
                  height: 52,
                  padding: "0 16px",
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                  background: "var(--background)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 30,
                  ...reveal(ramp(frame, beat(T.chips + index), beat(0.25))),
                  opacity: frame >= beat(T.chips + index) ? 1 : 0,
                }}
              >
                {chip}
              </div>
            ))}
          </div>
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
