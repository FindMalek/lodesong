import { Img, Sequence, useCurrentFrame } from "remotion";
import { plateSrc } from "../captures/film-manifest";
import { COPY, FILM } from "../copy";
import { FPS } from "../design/beat";
import { Camera, CameraBlur } from "../design/camera";
import { glowOf, gold } from "../design/gold";
import { MaskLine, VOID } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Caret, typedCount } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { DitherText } from "../ui/s1-dither-text";
import { FlashChip, PlateFlash } from "../ui/s11-flash";
import { type Intercut as IntercutPlan, S12_INTERCUTS, S12_LINES, S12_TIMES, S12_TYPED } from "./s12-plan";
import { shotOf } from "./timelines";

const shot = shotOf("land");

const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";

const PLATE = { w: 1440, h: 810 };
const K = 1920 / PLATE.w;
const COVER = { x: 38, y: 40, w: 487, h: 487 };
const COVER_WORLD = { x: COVER.x * K, y: COVER.y * K, size: COVER.w * K };
const CODE = { x: 660, y: 842, font: 28 };
const CODE_H = CODE.font * 1.5 * S12_LINES.length;
const URL_AT = { x: CODE.x, y: 950, font: 42 };
const LYRIC = { x: 770, y: 300, size: 104 };
const LINE = "i keep the lights on";
const CENTER = { x: 960, y: 540 };
const SAFE_BLUR_FRAMES = [S12_TIMES.enter, S12_TIMES.enter + 32] as const;
const DRIFT = 0.022;

interface View {
  cx: number;
  cy: number;
  scale: number;
  ry: number;
}

const BLOCK_VIEW: View = { cx: CODE.x + 595, cy: CODE.y + CODE_H / 2, scale: 1.3, ry: -3 };
const COVER_VIEW: View = { cx: COVER_WORLD.x + COVER_WORLD.size / 2, cy: COVER_WORLD.y + COVER_WORLD.size / 2, scale: 1.5, ry: -3 };
const HOME_VIEW: View = { cx: CENTER.x, cy: CENTER.y, scale: 1, ry: 0 };

const mix = (a: View, b: View, t: number): View => ({
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
  scale: lerp(a.scale, b.scale, t),
  ry: lerp(a.ry, b.ry, t),
});

/** Tight on the typing, a short travel up to the cover, then the pull-back to a front-on frame that holds at exactly 1x. */
function viewAt(frame: number): View {
  const { intercutEnd, enter, travelled, settled } = S12_TIMES;
  const drift = mix(BLOCK_VIEW, { ...BLOCK_VIEW, scale: 1.4 }, ramp(frame, intercutEnd, enter - intercutEnd, ease.out));
  if (frame < enter) return drift;
  const toCover = mix({ ...BLOCK_VIEW, scale: 1.4 }, COVER_VIEW, ramp(frame, enter, travelled - enter, ease.inOut));
  if (frame < travelled) return toCover;
  return mix(COVER_VIEW, HOME_VIEW, ramp(frame, travelled, settled - travelled, ease.out));
}

function camOf(view: View) {
  return { x: view.scale * (view.cx - CENTER.x), y: view.scale * (view.cy - CENTER.y), scale: view.scale, rx: 0, ry: view.ry };
}

function Wordmark({ font, at, legible }: { font: number; at: number; legible: boolean }) {
  return (
    <div
      data-legible={legible ? "" : undefined}
      style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: font, letterSpacing: "-0.04em", lineHeight: 1.1 }}
    >
      <MaskLine from={at} length={14}>
        <div style={{ display: "flex", alignItems: "center", gap: font * 0.26 }}>
          <svg aria-hidden width={font * 0.86} height={font * 0.86} viewBox="8 8 48 48" fill="currentColor">
            <path d={VEIN} />
          </svg>
          lodesong
        </div>
      </MaskLine>
    </div>
  );
}

function Command({ frame }: { frame: number }) {
  const { enter, settled } = S12_TIMES;
  const calm = frame < enter + 2 || frame >= settled;
  const lit = frame >= enter ? 1 - ramp(frame, enter, 20) : 0;
  const lastRow = S12_TYPED.findLastIndex((row) => typedCount(frame, row) > 0);
  const done = typedCount(frame, S12_TYPED.at(-1) ?? []) === (S12_LINES.at(-1)?.length ?? 0);
  return (
    <div
      style={{
        position: "absolute",
        left: CODE.x,
        top: CODE.y,
        color: gold(lit),
        fontFamily: "var(--font-mono)",
        fontSize: CODE.font,
        lineHeight: 1.5,
        whiteSpace: "pre",
        textShadow: lit > 0 ? `0 0 ${Math.round(lit * 28)}px color-mix(in oklch, var(--ignite) 60%, transparent)` : undefined,
      }}
    >
      {S12_LINES.map((line, row) => {
        const n = typedCount(frame, S12_TYPED[row] ?? []);
        return (
          <div key={line} data-legible={calm ? "" : undefined} style={{ height: CODE.font * 1.5 }}>
            {line.slice(0, n)}
            {row === lastRow && !(done && frame > enter + 30) ? <Caret frame={frame} typing={!done} size={CODE.font} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function Cover({ frame }: { frame: number }) {
  const { enter, settled } = S12_TIMES;
  const develop = ramp(frame, enter + 2, 18);
  const orb = frame < enter ? 0 : 1 - ramp(frame, enter + 24, 16);
  const halo = COVER_WORLD.size * lerp(1.5, 1.95, ramp(frame, enter, 40));
  const fade = 1 - ramp(frame, settled - 20, 20);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: COVER_WORLD.x + COVER_WORLD.size / 2 - halo,
          top: COVER_WORLD.y + COVER_WORLD.size / 2 - halo,
          width: halo * 2,
          height: halo * 2,
          background: glowOf(ramp(frame, enter, 14) * fade, 34),
        }}
      />
      <div style={{ position: "absolute", left: COVER_WORLD.x, top: COVER_WORLD.y, opacity: orb }}>
        <DitherCover
          id="quiet-hours-ii"
          size={Math.round(COVER_WORLD.size)}
          develop={develop}
          time={((Math.floor(frame / 8) * 8) / FPS) * 0.5}
          color={gold(1)}
        />
      </div>
    </>
  );
}

function AppWindow({ frame }: { frame: number }) {
  const { enter, settled, end } = S12_TIMES;
  const open = ramp(frame, enter + 20, settled - enter - 30, ease.inOut);
  const edge = (from: number, to: number) => lerp(from, to, open);
  const clip = `inset(${edge(COVER.y, 0)}px ${edge(PLATE.w - COVER.x - COVER.w, 0)}px ${edge(PLATE.h - COVER.y - COVER.h, 0)}px ${edge(COVER.x, 0)}px)`;
  const drift = 1 + DRIFT * ramp(frame, settled, end - 12 - settled, ease.out);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${drift})` }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: PLATE.w,
          height: PLATE.h,
          transform: `scale(${K})`,
          transformOrigin: "0 0",
          clipPath: clip,
          opacity: ramp(frame, enter + 24, 10),
        }}
      >
        <Img
          src={plateSrc("lyrics-full", "line-02")}
          style={{ width: "100%", height: "100%", display: "block", filter: "brightness(1.35)" }}
        />
        <i style={{ position: "absolute", left: 540, top: 0, width: 900, height: PLATE.h, background: "rgb(0 0 0 / 0.9)" }} />
      </div>
    </div>
  );
}

function EndCard({ frame }: { frame: number }) {
  const { band, wordmark, tagline, lyric, chip, hit, settled } = S12_TIMES;
  const steady = frame >= settled;
  const flash = ramp(frame, hit, 3) * (1 - ramp(frame, hit + 3, 14));
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 790,
          width: 1920,
          height: 290,
          background: "linear-gradient(to bottom, transparent, rgb(0 0 0 / 0.85) 14%, #000 26%)",
          opacity: ramp(frame, band, 14),
        }}
      />
      <div style={{ position: "absolute", left: 96, top: 846 }}>
        <Wordmark font={84} at={wordmark} legible={steady} />
      </div>
      <div
        data-legible={steady ? "" : undefined}
        style={{ position: "absolute", left: 96, top: 946, fontSize: 40, fontWeight: 500, letterSpacing: "-0.04em", whiteSpace: "nowrap" }}
      >
        <MaskLine from={tagline} length={14}>
          {COPY.headline[0]} <span style={{ color: "var(--muted-foreground)" }}>{COPY.headline[1]}</span>
        </MaskLine>
      </div>
      <div style={{ position: "absolute", left: LYRIC.x, top: LYRIC.y }}>
        <DitherText
          text={LINE}
          size={LYRIC.size}
          width={1060}
          height={150}
          progress={ramp(frame, lyric, 26, ease.inOut)}
          weight={600}
          color={gold(0.9)}
          glow={0.7}
          legible={frame >= lyric + 26 && steady}
        />
      </div>
      <div style={{ position: "absolute", left: 1462, top: URL_AT.y - 6 }}>
        <MaskLine from={chip} length={12}>
          <span
            data-legible={frame >= chip + 14 ? "" : undefined}
            style={{
              display: "inline-block",
              fontFamily: "var(--font-mono)",
              fontSize: 28,
              letterSpacing: "0.04em",
              color: "var(--foreground)",
              background: "color-mix(in oklch, var(--background) 88%, transparent)",
              border: "1px solid color-mix(in oklch, var(--foreground) 34%, transparent)",
              padding: "10px 18px",
              whiteSpace: "nowrap",
            }}
          >
            works with navidrome
          </span>
        </MaskLine>
      </div>
      <div style={{ position: "absolute", left: URL_AT.x, top: URL_AT.y, color: "var(--foreground)" }}>
        <MaskLine from={hit} length={8}>
          <span
            data-legible={frame >= hit + 10 ? "" : undefined}
            style={{ fontFamily: "var(--font-mono)", fontSize: URL_AT.font, letterSpacing: "0.02em", fontWeight: 500, lineHeight: 1.25 }}
          >
            {FILM.end.url}
          </span>
        </MaskLine>
      </div>
      <div
        style={{
          position: "absolute",
          left: URL_AT.x,
          top: URL_AT.y + 62,
          width: 640 * ramp(frame, hit, 12, ease.out),
          height: 2,
          background: "var(--ignite)",
          boxShadow: `0 0 ${10 + flash * 30}px color-mix(in oklch, var(--ignite) ${40 + Math.round(flash * 60)}%, transparent)`,
        }}
      />
    </>
  );
}

/** A warm pool behind the typing so the command never sits on a black frame. */
function TypingGlow({ frame }: { frame: number }) {
  const { intercutEnd, settled } = S12_TIMES;
  const on = ramp(frame, intercutEnd, 6) * (1 - ramp(frame, S12_TIMES.enter, settled - S12_TIMES.enter));
  if (on <= 0) return null;
  return (
    <i
      style={{
        position: "absolute",
        left: CODE.x - 120,
        top: CODE.y - 360,
        width: 1480,
        height: 760,
        background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 34%, transparent), transparent)",
        opacity: 0.9 * on,
      }}
    />
  );
}

function World() {
  const frame = useCurrentFrame();
  return (
    <Camera cam={camOf(viewAt(frame))}>
      <TypingGlow frame={frame} />
      <Cover frame={frame} />
      <AppWindow frame={frame} />
      <EndCard frame={frame} />
      <Command frame={frame} />
    </Camera>
  );
}

function Intercut({ cut, frames }: { cut: IntercutPlan; frames: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <PlateFlash take={cut.take} plate={cut.plate} focus={cut.focus} scale={cut.scale} frames={frames} frame={frame} />
      <div style={{ position: "absolute", inset: 0, background: `rgb(255 255 255 / ${0.2 * (1 - ramp(frame, 0, 4))})` }} />
      <FlashChip icon={cut.icon} text={cut.chip} frame={frame} at={1} />
    </div>
  );
}

export function LandShot() {
  const frame = useCurrentFrame();
  const blur = frame >= SAFE_BLUR_FRAMES[0] && frame < SAFE_BLUR_FRAMES[1];
  return (
    <>
      {S12_INTERCUTS.map((cut, i) => {
        const from = shot.beat(i);
        return (
          <Sequence key={cut.id} from={from} durationInFrames={shot.beat(i + 1) - from} name={cut.id}>
            <Intercut cut={cut} frames={shot.beat(i + 1) - from} />
          </Sequence>
        );
      })}
      {frame >= S12_TIMES.intercutEnd ? (
        <CameraBlur active={blur} samples={4} shutter={0.5} backdrop={VOID}>
          <World />
        </CameraBlur>
      ) : null}
    </>
  );
}
