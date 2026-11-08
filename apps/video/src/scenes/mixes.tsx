import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FILM } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { Label } from "../design/kinetic";
import { useLayout } from "../design/layout";
import { ease, lerp, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { MIXES } from "./timelines";

const NATIVE = 300;
const SOURCES = ["satellite-garden", "north-echo", "silver-atlas"] as const;

const GEOM = {
  wide: {
    source: { size: 340, cy: 420, xs: [480, 960, 1440] },
    merged: { size: 520, cx: 960, cy: 420 },
    slotSize: 300,
    slots: [304, 632, 960, 1288, 1616].map((x) => ({ x, y: 420 })),
    hero: 2,
    labels: [...FILM.mixes.row],
    caption: { left: 168, top: 700, font: 112 },
    tag: { left: 168, top: 150 },
    rules: [250, 590],
  },
  tall: {
    source: { size: 270, cy: 640, xs: [225, 540, 855] },
    merged: { size: 700, cx: 540, cy: 700 },
    slotSize: 420,
    slots: [
      { x: 324, y: 540 },
      { x: 756, y: 540 },
      { x: 324, y: 988 },
      { x: 756, y: 988 },
    ],
    hero: 0,
    labels: ["daily mix 1", "daily mix 2", "discover weekly", "daylist"],
    caption: { left: 90, top: 1250, font: 120 },
    tag: { left: 90, top: 270 },
    rules: [] as number[],
  },
} as const;

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
  const { layout } = useLayout();
  const g = GEOM[layout];
  const T = MIXES[layout];
  const time = frame / FPS;

  const merge = ramp(frame, beat(T.merge), beat(T.mergeEnd - T.merge), ease.inOut);
  const rowStart = beat(T.row);
  const shrink = ramp(frame, rowStart, beat(1), ease.inOut);
  const ignite = ramp(frame, beat(T.ignite), beat(0.5));
  const pulse = ramp(frame, beat(T.ignite), beat(0.25)) - ramp(frame, beat(T.ignite) + beat(0.25), beat(1));
  const gold = `color-mix(in oklch, var(--foreground) ${(1 - ignite) * 100}%, var(--ignite))`;
  const glow = ignite * 300 + pulse * 160;

  const heroSlot = g.slots[g.hero];
  const heroSize = lerp(lerp(g.source.size, g.merged.size, merge), g.slotSize, shrink);
  const heroX = lerp(g.merged.cx, heroSlot?.x ?? 0, shrink);
  const heroY = lerp(g.merged.cy, heroSlot?.y ?? 0, shrink);

  const cam = camAt(
    frame,
    layout === "wide"
      ? [
          { at: 0, x: -70, ry: 3, scale: 1.04 },
          { at: T.end, x: 70, ry: -3, scale: 1.0 },
        ]
      : [
          { at: 0, y: -30, ry: -4, scale: 1.04 },
          { at: T.end, y: 30, ry: 3, scale: 1.0 },
        ],
    (t) => t,
  );
  const others = g.slots.map((slot, index) => ({ slot, index, label: g.labels[index] ?? "" })).filter(({ index }) => index !== g.hero);

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
          {g.rules.map((y) => (
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
          <div style={{ position: "absolute", left: g.tag.left, top: g.tag.top, opacity: ramp(frame, 0, beat(0.5)) * (1 - shrink) }}>
            <Label>{FILM.mixes.source}</Label>
          </div>

          {others.map(({ slot, index, label }, order) => {
            const start = rowStart + beat(0.25) * (layout === "wide" ? Math.abs(index - g.hero) - 1 : order);
            const s = ramp(frame, start, beat(1.5), ease.out);
            const x = lerp(heroX, slot.x, s);
            const y = lerp(heroY, slot.y, s);
            return (
              <div key={label} style={{ opacity: s > 0 ? 1 : 0 }}>
                <Tile cx={x} cy={y} size={g.slotSize}>
                  <DitherCover id={`mix-${label}`} size={NATIVE} develop={ramp(frame, start, beat(1.5), ease.inOut)} time={time * 0.4} />
                </Tile>
                <Chip cx={x} cy={y} size={g.slotSize} text={label} opacity={ramp(frame, start + beat(0.75), beat(0.5))} />
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
              background: "radial-gradient(circle, color-mix(in oklch, var(--ignite) 26%, transparent), transparent 68%)",
            }}
          />

          <div
            style={{ position: "absolute", left: heroX - heroSize / 2, top: heroY - heroSize / 2, width: heroSize, height: heroSize, background: "var(--card)", opacity: merge }}
          />
          {SOURCES.map((id, index) => {
            const sx = g.source.xs[index] ?? 0;
            return (
              <div key={id}>
                <Tile cx={lerp(sx, heroX, merge)} cy={lerp(g.source.cy, heroY, merge)} size={heroSize}>
                  <div style={{ position: "relative", width: NATIVE, height: NATIVE, isolation: "isolate" }}>
                    <div style={{ position: "absolute", inset: 0, background: "var(--card)", opacity: 1 - merge, zIndex: -1 }} />
                    <DitherCover
                      id={id}
                      size={NATIVE}
                      develop={ramp(frame, beat(T.cover) + beat(0.25) * index, beat(2), ease.inOut)}
                      time={time * 0.4}
                      bare
                      color={gold}
                    />
                  </div>
                </Tile>
                <div
                  style={{
                    position: "absolute",
                    left: sx - 170,
                    top: g.source.cy + g.source.size / 2 + 24,
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
          <Chip cx={heroX} cy={heroY} size={heroSize} text={g.labels[g.hero] ?? ""} opacity={ramp(frame, beat(T.chip), beat(0.5))} />
        </Layer>

        <Layer z={90}>
          <Caption
            lines={FILM.mixes.caption}
            from={beat(T.caption)}
            font={g.caption.font}
            style={{ left: g.caption.left, top: g.caption.top }}
          />
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
