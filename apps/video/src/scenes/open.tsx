import { Audio } from "@remotion/media";
import type { CSSProperties } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COPY } from "../copy";
import { beat, FPS } from "../design/beat";
import { FontGate } from "../design/fonts";
import { Grain, Vignette } from "../design/grain";
import { Label, MaskLine, VOID } from "../design/kinetic";
import { ease, hash, lerp, ramp } from "../design/motion";
import { Probe } from "../design/probe";
import { DitherCover } from "../ui/dither-cover";
import { LyricsCloseUp } from "../ui/lyrics-close-up";
import { Lyrics, Main, PlayerBar, Sidebar, STAGE } from "../ui/player-panels";
import { FRAMES, LABEL_FADE, T } from "./open-timeline";

const START_SECONDS = 71;
const FOCUS_FROM = 2;
const DIM = 0.2;
const MARK = 56;

function timecode(frame: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `00:00:${pad(Math.floor(frame / FPS))}:${pad(frame % FPS)}`;
}

interface Fly {
  x: number;
  y: number;
  z: number;
  from: number;
}

function fly(frame: number, spec: Fly) {
  const t = ramp(frame, spec.from, beat(1));
  return {
    "--float": 1 - t,
    transform: `translate3d(${lerp(spec.x, 0, t)}px, ${lerp(spec.y, 0, t)}px, ${lerp(spec.z, 0, t)}px)`,
  } as CSSProperties;
}

function Marks() {
  const arm = 28;
  const line = { position: "absolute", background: "var(--muted-foreground)", opacity: 0.6 } as const;
  return (
    <>
      {[0, 1, 2, 3].map((corner) => {
        const left = corner % 2 === 0;
        const top = corner < 2;
        const h = { ...line, width: arm, height: 1, [left ? "left" : "right"]: MARK, [top ? "top" : "bottom"]: MARK } as const;
        const v = { ...line, width: 1, height: arm, [left ? "left" : "right"]: MARK, [top ? "top" : "bottom"]: MARK } as const;
        return (
          <div key={corner}>
            <div style={h} />
            <div style={v} />
          </div>
        );
      })}
    </>
  );
}

const layer = { position: "absolute", inset: 0, transformStyle: "preserve-3d" } as const;

export function Open({ probe = false }: { probe?: boolean }) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const time = frame / FPS;
  const cut = beat(T.cut);
  const inCloseUp = frame >= beat(T.chip) && frame < cut;

  const focus = FOCUS_FROM + ramp(frame, beat(T.ignite), beat(0.5)) + ramp(frame, beat(T.advance), beat(0.5));
  const ignite = ramp(frame, beat(T.ignite), beat(0.5));
  const pulse = ramp(frame, beat(T.ignite), beat(0.25)) - ramp(frame, beat(T.ignite) + beat(0.25), beat(1));

  const wideT = ramp(frame, cut, FRAMES - cut, ease.inOut);
  const scale = lerp(1, 1.06, wideT);
  const rotateY = lerp(-7, -4, wideT);
  const rotateX = lerp(5, 2, wideT);
  const dim = ramp(frame, beat(T.lift), beat(1), ease.inOut);
  const stageFade = (from: number) => ramp(frame, from, beat(0.5)) * (1 - DIM * dim);
  const bars = [0, 1, 2, 3].map((i) => 0.25 + 0.75 * hash(Math.floor(frame / beat(0.25)) + i * 13));
  const position = START_SECONDS + time;

  const headlineOut = beat(T.headlineOut);
  const gone = ramp(frame, headlineOut, beat(0.5));

  return (
    <FontGate>
      <AbsoluteFill className="dark" style={{ background: VOID, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
        <AbsoluteFill style={{ opacity: 0.16 * (1 - gone), maskImage: "radial-gradient(circle at 50% 50%, black 0, transparent 540px)" }}>
          <div style={{ position: "absolute", left: (width - 1080) / 2, top: 0 }}>
            <DitherCover id="lodesong-open" size={1080} time={time * 0.6} />
          </div>
        </AbsoluteFill>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 1,
            background: "var(--border)",
            transform: `scaleX(${ramp(frame, 0, beat(1), ease.inOut)})`,
            opacity: 1 - gone,
          }}
        />

        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 168 }}>
          <div style={{ fontSize: 176, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
            <MaskLine from={beat(T.music)} out={headlineOut}>
              {COPY.headline[0]}
            </MaskLine>
            <MaskLine from={beat(T.server)} out={headlineOut} style={{ color: "var(--muted-foreground)" }}>
              {COPY.headline[1]}
            </MaskLine>
          </div>
          <div
            style={{
              position: "absolute",
              left: 168,
              bottom: 150,
              opacity: ramp(frame, beat(T.label), beat(LABEL_FADE)) * (1 - gone),
            }}
          >
            <Label>{COPY.label}</Label>
          </div>
        </AbsoluteFill>

        {inCloseUp ? (
          <LyricsCloseUp
            focus={focus}
            enter={ramp(frame, beat(T.press), beat(1))}
            ignite={ignite}
            pulse={pulse}
            develop={ramp(frame, beat(T.chip), beat(T.ignite - T.chip), ease.inOut)}
            time={time * 0.5}
            chip={ramp(frame, beat(T.chip), beat(1))}
            press={ramp(frame, beat(T.press), beat(0.125)) - ramp(frame, beat(T.press) + beat(0.25), beat(0.25))}
          />
        ) : null}

        {frame >= cut ? (
          <AbsoluteFill style={{ perspective: 2200, alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                position: "relative",
                width: STAGE.width,
                height: STAGE.height,
                transformStyle: "preserve-3d",
                transform: `scale(${scale}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
              }}
            >
              <div style={{ ...layer, ...fly(frame, { x: 0, y: 70, z: -500, from: cut }), opacity: stageFade(cut) }}>
                <Main develop={1} time={time * 0.5} bars={bars} coverColor="var(--ignite)" />
              </div>
              <div
                style={{
                  ...layer,
                  ...fly(frame, { x: -300, y: 0, z: -260, from: cut + beat(0.25) }),
                  opacity: stageFade(cut + beat(0.25)),
                }}
              >
                <Sidebar />
              </div>
              <div
                style={{ ...layer, ...fly(frame, { x: 0, y: 240, z: -160, from: cut + beat(0.5) }), opacity: stageFade(cut + beat(0.5)) }}
              >
                <PlayerBar position={position} coverColor="var(--ignite)" />
              </div>
              <div style={{ ...layer, transform: `translateZ(${dim * 60}px)`, ...({ "--float": dim } as CSSProperties) }}>
                <Lyrics focus={focus} />
              </div>
            </div>
          </AbsoluteFill>
        ) : null}

        <Vignette />
        <Marks />
        <div data-furniture="" style={{ position: "absolute", right: MARK + 44, top: MARK - 10, opacity: 0.8 }}>
          <Label style={{ fontSize: 20 }}>{timecode(frame)}</Label>
        </div>
        <Grain />
        <Audio src={staticFile("audio/open.wav")} />
        {probe ? <Probe /> : null}
      </AbsoluteFill>
    </FontGate>
  );
}
