import { Kbd } from "@lodesong/ui/components/kbd";
import { COPY } from "../copy";
import { Label, VOID } from "../design/kinetic";
import { DitherCover } from "./dither-cover";

const LINE = 150;
const MARGIN = 168;
const COVER = 440;
const COVER_X = 1920 - MARGIN - COVER;

export interface CloseUpState {
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

/** The lyrics hero shot, laid out for a 1920x1080 frame: not the app panel zoomed, a layout made for this crop. */
export function LyricsCloseUp({ focus, enter, ignite, pulse, develop, time, chip, press }: CloseUpState) {
  const color = `color-mix(in oklch, var(--foreground) ${(1 - ignite) * 100}%, var(--ignite))`;
  const glow = ignite * 380 + pulse * 200;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: MARGIN,
          top: 0,
          width: 1060,
          height: 1080,
          maskImage: "linear-gradient(to bottom, transparent 6%, black 30%, black 70%, transparent 94%)",
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
                top: 540 - LINE / 2 + (index - focus) * LINE,
                height: LINE,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                opacity: 0.28 + 0.72 * weight,
              }}
            >
              <div
                style={{
                  transform: `translateY(${(1 - rise) * 110}%)`,
                  fontSize: 92,
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

      <div style={{ position: "absolute", left: COVER_X, top: 270, opacity: chip }}>
        <div
          style={{
            position: "absolute",
            left: COVER / 2 - glow,
            top: COVER / 2 - glow,
            width: glow * 2,
            height: glow * 2,
            background: "radial-gradient(circle, color-mix(in oklch, var(--ignite) 30%, transparent), transparent 68%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <DitherCover id="quiet-hours-ii" size={COVER} develop={develop} time={time} color={color} />
        </div>
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 8 }}>
          <Label style={{ color: "var(--foreground)" }}>{COPY.cover.track}</Label>
          <Label>{COPY.cover.artist}</Label>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: COVER_X,
          bottom: 96,
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
