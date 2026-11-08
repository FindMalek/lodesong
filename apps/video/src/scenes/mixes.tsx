import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FILM } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { glowOf, gold } from "../design/gold";
import { Label } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { MIXES as T } from "./timelines";

const NATIVE = 300;
const SOURCES = ["satellite-garden", "north-echo", "silver-atlas"] as const;
const SOURCE = { size: 340, cy: 420, xs: [480, 960, 1440] } as const;
const MERGED = { size: 520, cx: 960, cy: 420 } as const;
const SLOT = 300;
const SLOTS = [304, 632, 960, 1288, 1616].map((x) => ({ x, y: 420 }));
const HERO = 2;
const EMERGE_ORDER = [1, 3, 0, 4] as const;
const RULES = [250, 590] as const;

function Tile({ cx, cy, size, children }: { cx: number; cy: number; size: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, width: size, height: size }}>
      <div style={{ width: NATIVE, height: NATIVE, transform: `scale(${size / NATIVE})`, transformOrigin: "0 0" }}>{children}</div>
    </div>
  );
}

function Chip({ cx, cy, size, text, opacity }: { cx: number; cy: number; size: number; text: string; opacity: number }) {
  return (
    <div
      data-legible=""
      style={{
        position: "absolute",
        left: cx - size / 2 + 14,
        top: cy + size / 2 - 14 - 44,
        height: 44,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        background: "var(--background)",
        border: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: 30,
        fontWeight: 500,
        opacity,
      }}
    >
      {text}
    </div>
  );
}

export function MixesShot() {
  const frame = useCurrentFrame();
  const time = frame / FPS;

  const merge = ramp(frame, beat(T.merge), beat(T.mergeEnd - T.merge), ease.inOut);
  const rowStart = beat(T.row);
  const shrink = ramp(frame, rowStart, beat(1), ease.inOut);
  const ignite = ramp(frame, beat(T.ignite), beat(0.5));
  const pulse = ramp(frame, beat(T.ignite), beat(0.25)) - ramp(frame, beat(T.ignite) + beat(0.25), beat(1));
  const glow = ignite * 300 + pulse * 160;

  const heroSlot = SLOTS[HERO];
  const heroSize = lerp(lerp(SOURCE.size, MERGED.size, merge), SLOT, shrink);
  const heroX = lerp(MERGED.cx, heroSlot?.x ?? 0, shrink);
  const heroY = lerp(MERGED.cy, heroSlot?.y ?? 0, shrink);

  const cam = camAt(
    frame,
    [
      { at: 0, x: -70, ry: 3, scale: 1.04 },
      { at: T.end, x: 70, ry: -3, scale: 1.0 },
    ],
    (t) => t,
  );

  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Layer z={-420}>
          <AbsoluteFill style={{ opacity: 0.12, maskImage: "radial-gradient(circle at 50% 45%, black 0, transparent 620px)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
              <DitherCover id="mixes-field" size={1080} time={time * 0.5} />
            </div>
          </AbsoluteFill>
        </Layer>

        <Layer z={-60}>
          {RULES.map((y) => (
            <div
              key={y}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: y,
                height: 1,
                background: "var(--border)",
                transform: `scaleX(${ramp(frame, rowStart, beat(1.5), ease.out)})`,
              }}
            />
          ))}
        </Layer>

        <Layer z={0}>
          <div style={{ position: "absolute", left: 168, top: 150, opacity: ramp(frame, 0, beat(0.5)) * (1 - shrink) }}>
            <Label>{FILM.mixes.source}</Label>
          </div>

          {EMERGE_ORDER.map((index, order) => {
            const slot = SLOTS[index];
            const label = FILM.mixes.row[index] ?? "";
            const start = rowStart + beat(0.5) * order;
            const s = ramp(frame, start, beat(1.25), ease.out);
            const x = lerp(heroX, slot?.x ?? 0, s);
            const y = lerp(heroY, slot?.y ?? 0, s);
            return (
              <div key={label} style={{ opacity: s > 0 ? 1 : 0 }}>
                <Tile cx={x} cy={y} size={SLOT}>
                  <DitherCover id={`mix-${label}`} size={NATIVE} develop={ramp(frame, start, beat(1.25), ease.inOut)} time={time * 0.4} />
                </Tile>
                <Chip cx={x} cy={y} size={SLOT} text={label} opacity={ramp(frame, start + beat(0.25), beat(0.25))} />
              </div>
            );
          })}

          <div
            style={{
              position: "absolute",
              left: heroX - glow,
              top: heroY - glow,
              width: glow * 2,
              height: glow * 2,
              background: glowOf(1, 26),
            }}
          />
          <div
            style={{
              position: "absolute",
              left: heroX - heroSize / 2,
              top: heroY - heroSize / 2,
              width: heroSize,
              height: heroSize,
              background: "var(--card)",
              opacity: merge,
            }}
          />
          {SOURCES.map((id, index) => {
            const sx = SOURCE.xs[index] ?? 0;
            return (
              <div key={id}>
                <Tile cx={lerp(sx, heroX, merge)} cy={lerp(SOURCE.cy, heroY, merge)} size={heroSize}>
                  <div style={{ position: "relative", width: NATIVE, height: NATIVE, isolation: "isolate" }}>
                    <div style={{ position: "absolute", inset: 0, background: "var(--card)", opacity: 1 - merge, zIndex: -1 }} />
                    <DitherCover
                      id={id}
                      size={NATIVE}
                      develop={ramp(frame, beat(T.cover) + beat(0.25) * index, beat(2), ease.inOut)}
                      time={time * 0.4}
                      bare
                      color={gold(ignite)}
                    />
                  </div>
                </Tile>
                <div
                  style={{
                    position: "absolute",
                    left: sx - 170,
                    top: SOURCE.cy + SOURCE.size / 2 + 24,
                    width: 340,
                    textAlign: "center",
                    opacity: (1 - merge) * ramp(frame, beat(0.75) + beat(0.25) * index, beat(0.5)),
                  }}
                >
                  <Label>{FILM.mixes.artists[index]}</Label>
                </div>
              </div>
            );
          })}
          <Chip cx={heroX} cy={heroY} size={heroSize} text={FILM.mixes.row[HERO] ?? ""} opacity={ramp(frame, beat(T.chip), beat(0.25))} />
        </Layer>

        <Layer z={90}>
          <Caption lines={FILM.mixes.caption} from={beat(T.caption)} font={112} style={{ left: 168, top: 700 }} />
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
