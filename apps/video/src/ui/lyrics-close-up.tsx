import { Kbd } from "@lodesong/ui/components/kbd";
import { COPY } from "../copy";
import { Label, VOID } from "../design/kinetic";
import type { Layout } from "../design/layout";
import { DitherCover } from "./dither-cover";

const GEOM = {
  wide: {
    line: 150,
    font: 92,
    textLeft: 168,
    textW: 1060,
    cover: 440,
    coverX: 1312,
    coverY: 270,
    chipX: 1312,
    chipY: 900,
    mid: 540,
    span: 1080,
  },
  tall: {
    line: 124,
    font: 78,
    textLeft: 90,
    textW: 900,
    cover: 520,
    coverX: 280,
    coverY: 390,
    chipX: 90,
    chipY: 250,
    mid: 1310,
    span: 560,
  },
} as const;

export interface CloseUpState {
  layout?: Layout;
  focus: number;
  enter: number;
  /** 0 to 1: the cover turns from ink to the one accent colour */
  ignite: number;
  pulse: number;
  develop: number;
  time: number;
  chip: number;
  press: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** The lyrics hero shot: a layout made for each crop (92 px lines beside a cover on wide, a cover above 78 px lines on tall), not the app panel zoomed. */
export function LyricsCloseUp({ layout = "wide", focus, enter, ignite, pulse, develop, time, chip, press }: CloseUpState) {
  const g = GEOM[layout];
  const color = `color-mix(in oklch, var(--foreground) ${(1 - ignite) * 100}%, var(--ignite))`;
  const glow = ignite * (layout === "wide" ? 380 : 330) + pulse * 200;
  const tall = layout === "tall";
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: g.textLeft,
          top: g.mid - g.span / 2,
          width: g.textW,
          height: g.span,
          maskImage: "linear-gradient(to bottom, transparent 4%, black 30%, black 70%, transparent 96%)",
        }}
      >
        {COPY.lyrics.map((line, index) => {
          const weight = Math.max(0, 1 - Math.abs(index - focus));
          const rise = clamp01(enter * 2 - Math.min(Math.abs(index - 2), 2) * 0.5);
          return (
            <div
              key={line}
              style={{
                position: "absolute",
                top: g.span / 2 - g.line / 2 + (index - focus) * g.line,
                height: g.line,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                opacity: 0.3 + 0.7 * weight,
              }}
            >
              <div
                style={{
                  transform: `translateY(${(1 - rise) * 110}%)`,
                  fontSize: g.font,
                  fontWeight: 500,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                }}
              >
                <span data-legible={weight > 0.9 ? "" : undefined}>{line}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", left: g.coverX, top: g.coverY, opacity: chip }}>
        <div
          style={{
            position: "absolute",
            left: g.cover / 2 - glow,
            top: g.cover / 2 - glow,
            width: glow * 2,
            height: glow * 2,
            background: "radial-gradient(circle, color-mix(in oklch, var(--ignite) 30%, transparent), transparent 68%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <DitherCover id="quiet-hours-ii" size={g.cover} develop={develop} time={time} color={color} />
        </div>
        <div
          style={{
            marginTop: 32,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: tall ? "center" : "flex-start",
            width: g.cover,
          }}
        >
          <Label style={{ color: "var(--foreground)" }}>{COPY.cover.track}</Label>
          <Label>{COPY.cover.artist}</Label>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: g.chipX,
          top: g.chipY,
          transform: `translateY(${(1 - chip) * 16}px)`,
          opacity: chip,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: 14,
          background: VOID,
          border: "1px solid var(--border)",
        }}
      >
        <Kbd
          data-legible=""
          style={{
            width: 56,
            height: 56,
            fontSize: 28,
            background: "var(--foreground)",
            color: "var(--background)",
            transform: `translateY(${press * 4}px)`,
          }}
        >
          {COPY.key}
        </Kbd>
        <Label style={{ color: "var(--foreground)" }}>{COPY.keyLabel}</Label>
      </div>
    </div>
  );
}
