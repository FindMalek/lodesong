import { Img, useCurrentFrame } from "remotion";
import { plateBox, plateSrc } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld, Layer } from "../design/camera";
import { Bokeh, DofLayer, focusAt } from "../design/dof";
import { ease, hash, ramp } from "../design/motion";
import { Caret, typedCount } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { ShotChip } from "../ui/s1-chip";
import { DitherText } from "../ui/s1-dither-text";

const COVER = 600;
const COVER_AT = { x: 200, y: 240 };
const CENTER = { x: COVER_AT.x + COVER / 2, y: COVER_AT.y + COVER / 2 };
const TEXT_X = 890;

const IGNITE_AT = 24;
const COVER_DONE = 84;
const LYRIC_AT = 92;
const LYRIC_OUT = 150;
const WORDMARK_AT = 160;
const TYPE_AT = 198;
const TYPE_STEP = 2.6;
const BAR_AT = 36;
const CHIP_AT = 214;

const LYRIC = "i keep the lights on";
const WORDMARK = "lodesong";
const TAGLINE = "your music. your server.";
const LANDINGS = Array.from(TAGLINE, (_, i) => Math.round(TYPE_AT + i * TYPE_STEP));

export const S1_CUES: readonly ShotCue[] = [
  { shot: "cold-open", at: 0, kind: "tick", label: "point flickers" },
  { shot: "cold-open", at: IGNITE_AT, kind: "kick", label: "ignite: the gold point opens the cover" },
  { shot: "cold-open", at: IGNITE_AT + 6, kind: "swell", label: "cover resolves from dots" },
  { shot: "cold-open", at: LYRIC_AT, kind: "ping", label: "lyric forms from dots" },
  { shot: "cold-open", at: WORDMARK_AT, kind: "ping", label: "wordmark resolves" },
  ...LANDINGS.map((at, i): ShotCue => ({ shot: "cold-open", at, kind: "typed", label: `type: ${TAGLINE[i]}` })),
];

const g = (frame: number): number => frame / 30;
const bump = (frame: number, from: number, peak: number, to: number): number =>
  Math.max(0, Math.min(1, frame < peak ? (frame - from) / (peak - from) : (to - frame) / (to - peak)));

const CAM = [
  { at: 0, scale: 1, x: 0, y: 0 },
  { at: g(288), scale: 1.07, x: 26, y: -6 },
];

const RACK = [
  { at: 0, z: 300 },
  { at: g(74), z: 0 },
];

const BAR = plateBox("player-bar", "bar", "bar");
const BAR_K = 1.75;
const GHOSTS = [
  { k: 0.6, r: 26 },
  { k: 1.4, r: 54 },
  { k: 2, r: 92 },
];

function Spark({ frame }: { frame: number }) {
  const lit = frame < IGNITE_AT ? 0.55 + 0.45 * hash(Math.floor(frame / 2) * 3.1) : 1;
  const swell = ramp(frame, 0, IGNITE_AT, ease.in);
  const burst = ramp(frame, IGNITE_AT, 8) * (1 - ramp(frame, IGNITE_AT + 8, 40));
  const halo = 80 + 140 * swell + 300 * burst;
  const fade = 1 - ramp(frame, 40, 34);
  const streak = ramp(frame, IGNITE_AT - 2, 18, ease.out);
  const ring = ramp(frame, IGNITE_AT, 44, ease.out);
  const ghost = bump(frame, IGNITE_AT, IGNITE_AT + 10, 70);
  return (
    <>
      <i
        style={{
          position: "absolute",
          left: CENTER.x - halo,
          top: CENTER.y - halo,
          width: halo * 2,
          height: halo * 2,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--ignite) 80%, white) 0%, color-mix(in oklch, var(--ignite) 46%, transparent) 22%, transparent 70%)",
          opacity: lit * fade,
        }}
      />
      <i
        style={{
          position: "absolute",
          left: CENTER.x - 8 - 4 * swell,
          top: CENTER.y - 8 - 4 * swell,
          width: 16 + 8 * swell,
          height: 16 + 8 * swell,
          borderRadius: "50%",
          background: "#fff8e8",
          boxShadow: "0 0 18px 6px var(--ignite)",
          opacity: lit * fade,
        }}
      />
      <i
        style={{
          position: "absolute",
          left: CENTER.x - 700 * streak,
          top: CENTER.y - 1.5,
          width: 1400 * streak,
          height: 3,
          background: "linear-gradient(90deg, transparent, color-mix(in oklch, var(--ignite) 90%, white) 50%, transparent)",
          filter: "blur(1.5px)",
          opacity: 0.9 * (1 - ramp(frame, IGNITE_AT + 10, 44)),
          mixBlendMode: "plus-lighter",
        }}
      />
      {ring > 0 && ring < 1 ? (
        <i
          style={{
            position: "absolute",
            left: CENTER.x - 520 * ring,
            top: CENTER.y - 520 * ring,
            width: 1040 * ring,
            height: 1040 * ring,
            borderRadius: "50%",
            border: "2px solid var(--ignite)",
            opacity: 0.7 * (1 - ring) ** 1.4,
          }}
        />
      ) : null}
      {GHOSTS.map((ghostCircle) => (
        <i
          key={ghostCircle.k}
          style={{
            position: "absolute",
            left: CENTER.x + (960 - CENTER.x) * ghostCircle.k - ghostCircle.r,
            top: CENTER.y + (540 - CENTER.y) * ghostCircle.k - ghostCircle.r,
            width: ghostCircle.r * 2,
            height: ghostCircle.r * 2,
            borderRadius: "50%",
            background: "radial-gradient(circle, color-mix(in oklch, var(--ignite) 22%, transparent), transparent 70%)",
            opacity: ghost * 0.8,
          }}
        />
      ))}
    </>
  );
}

/** S1: darkness, one gold point flickering, then igniting into the dither cover; the lyric forms from dots, the wordmark resolves, the promise types. */
export function ColdOpenShot() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, CAM), handheld(frame, 0.5));
  const focusZ = focusAt(frame, RACK);
  const radius = 440 * ramp(frame, IGNITE_AT, COVER_DONE - IGNITE_AT, ease.out);
  const develop = ramp(frame, IGNITE_AT + 4, COVER_DONE - IGNITE_AT - 4, ease.inOut);
  const typed = typedCount(frame, LANDINGS);
  const typing = frame >= TYPE_AT && typed < TAGLINE.length;
  const lyric = ramp(frame, LYRIC_AT, 40, ease.inOut) * (1 - ramp(frame, LYRIC_OUT, 22, ease.in));
  const wordmark = ramp(frame, WORDMARK_AT, 36, ease.inOut);
  const leakLeft = 0.24 * bump(frame, 10, 52, 130);
  const leakRight = 0.16 * bump(frame, 150, 190, 262);
  return (
    <>
      <Camera cam={cam}>
        <DofLayer z={0} focusZ={focusZ} aperture={0.03}>
          <div
            style={{
              position: "absolute",
              left: COVER_AT.x,
              top: COVER_AT.y,
              width: COVER,
              height: COVER,
              clipPath: `circle(${radius}px at ${COVER / 2}px ${COVER / 2}px)`,
            }}
          >
            <i style={{ position: "absolute", inset: 0, background: "var(--card)", opacity: ramp(frame, IGNITE_AT + 24, 44) }} />
            <div style={{ position: "absolute", inset: 0 }}>
              <DitherCover id="signal violet pt. 2" size={COVER} develop={develop} time={frame / 90} bare />
            </div>
            <div aria-hidden style={{ position: "absolute", inset: 0, mixBlendMode: "plus-lighter", opacity: 0.16, filter: "blur(30px)" }}>
              <DitherCover id="signal violet pt. 2" size={COVER} develop={develop} time={frame / 90} bare />
            </div>
          </div>
          <Spark frame={frame} />
          <div style={{ position: "absolute", left: TEXT_X, top: 470 }}>
            <DitherText
              text={LYRIC}
              size={84}
              width={980}
              height={120}
              progress={lyric}
              weight={600}
              color="color-mix(in oklch, var(--foreground) 90%, var(--ignite))"
              glow={0.55}
            />
          </div>
          <div style={{ position: "absolute", left: TEXT_X, top: 400 }}>
            <DitherText text={WORDMARK} size={150} width={900} height={190} progress={wordmark} weight={600} glow={0.18} />
          </div>
          <div
            data-legible={typed > 0 ? "" : undefined}
            style={{
              position: "absolute",
              left: TEXT_X + 4,
              top: 626,
              fontSize: 54,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "color-mix(in oklch, var(--foreground) 78%, transparent)",
              whiteSpace: "nowrap",
            }}
          >
            {TAGLINE.slice(0, typed)}
            {frame >= TYPE_AT ? <Caret frame={frame} typing={typing} size={54} /> : null}
          </div>
          <ShotChip text="self-hosted music player" from={CHIP_AT} left={COVER_AT.x} top={COVER_AT.y + COVER + 2} />
        </DofLayer>
        <Layer z={0}>
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: 1920,
              height: BAR.h * BAR_K,
              overflow: "hidden",
              filter: "grayscale(1) brightness(1.5)",
              transform: `translateY(${(1 - ramp(frame, BAR_AT, 26, ease.out)) * BAR.h * BAR_K}px)`,
            }}
          >
            <Img
              src={plateSrc("player-bar", "bar")}
              style={{ position: "absolute", left: 0, top: -BAR.y * BAR_K, width: 1440 * BAR_K, height: 810 * BAR_K, maxWidth: "none" }}
            />
          </div>
        </Layer>
        <Bokeh focusZ={focusZ} z={300} count={14} seed={7} opacity={0.2} />
      </Camera>
      <i
        style={{
          position: "absolute",
          left: -220,
          top: 0,
          width: 760,
          height: 1080,
          background: "radial-gradient(ellipse at 0% 50%, color-mix(in oklch, var(--ignite) 70%, transparent), transparent 68%)",
          mixBlendMode: "plus-lighter",
          opacity: leakLeft,
        }}
      />
      <i
        style={{
          position: "absolute",
          right: -260,
          top: -120,
          width: 760,
          height: 900,
          background: "radial-gradient(ellipse at 100% 20%, color-mix(in oklch, var(--ignite) 60%, transparent), transparent 66%)",
          mixBlendMode: "plus-lighter",
          opacity: leakRight,
        }}
      />
    </>
  );
}
