import { Img, useCurrentFrame } from "remotion";
import { plateSrc } from "../captures/film-manifest";
import { COPY, FILM } from "../copy";
import { FPS } from "../design/beat";
import { Camera, CameraBlur } from "../design/camera";
import { glowOf, gold } from "../design/gold";
import { MaskLine, VOID } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Caret, typedCount } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { S12_LINES, S12_TIMES, S12_TYPED } from "./s12-plan";

const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";

const WINDOW = { x: 800, y: 60, w: 1060 };
const PLATE = { w: 1440, h: 810 };
const K = WINDOW.w / PLATE.w;
const WINDOW_H = PLATE.h * K;
const COVER = { x: 38, y: 40, w: 487, h: 487 };
const COVER_WORLD = { x: WINDOW.x + COVER.x * K, y: WINDOW.y + COVER.y * K, size: COVER.w * K };
const CODE = { x: WINDOW.x, y: 690, w: WINDOW.w, font: 31 };
const CODE_H = 216;
const URL_AT = { x: WINDOW.x, y: 940, font: 46 };
const CENTER = { x: 960, y: 540 };
const SAFE_BLUR_FRAMES = [S12_TIMES.enter, S12_TIMES.enter + 46] as const;

interface View {
  cx: number;
  cy: number;
  scale: number;
  ry: number;
}

const BLOCK_VIEW: View = { cx: CODE.x + CODE.w / 2, cy: CODE.y + CODE_H / 2, scale: 1.6, ry: -3 };
const COVER_VIEW: View = { cx: COVER_WORLD.x + COVER_WORLD.size / 2, cy: COVER_WORLD.y + COVER_WORLD.size / 2, scale: 2.2, ry: -3 };
const HOME_VIEW: View = { cx: CENTER.x, cy: CENTER.y, scale: 1, ry: 0 };

const mix = (a: View, b: View, t: number): View => ({
  cx: lerp(a.cx, b.cx, t),
  cy: lerp(a.cy, b.cy, t),
  scale: lerp(a.scale, b.scale, t),
  ry: lerp(a.ry, b.ry, t),
});

/** Tight on the typing, a short travel up to the cover, then the long pull-back to a front-on frame that holds at exactly 1x. */
function viewAt(frame: number): View {
  const { enter, travelled, settled } = S12_TIMES;
  const drift = mix(BLOCK_VIEW, { ...BLOCK_VIEW, scale: 1.68 }, ramp(frame, 0, enter, ease.out));
  if (frame < enter) return drift;
  const toCover = mix({ ...BLOCK_VIEW, scale: 1.68 }, COVER_VIEW, ramp(frame, enter, travelled - enter, ease.inOut));
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
  const lit = frame >= enter ? 1 - ramp(frame, enter, 18) : 0;
  const lastRow = S12_TYPED.findLastIndex((row) => typedCount(frame, row) > 0);
  const done = typedCount(frame, S12_TYPED.at(-1) ?? []) === (S12_LINES.at(-1)?.length ?? 0);
  return (
    <div
      style={{
        position: "absolute",
        left: CODE.x,
        top: CODE.y,
        width: CODE.w,
        height: CODE_H,
        padding: "30px 36px",
        boxSizing: "border-box",
        border: `1px solid color-mix(in oklch, var(--ignite) ${Math.round(lit * 100)}%, color-mix(in oklch, var(--foreground) 32%, transparent))`,
        background: `color-mix(in oklch, var(--ignite) ${Math.round(lit * 22)}%, #050505)`,
        fontFamily: "var(--font-mono)",
        fontSize: CODE.font,
        lineHeight: 1.5,
        whiteSpace: "pre",
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
  const { enter, hit } = S12_TIMES;
  const develop = ramp(frame, enter + 2, 18);
  const orb = frame < enter ? 0 : 1 - ramp(frame, enter + 24, 16);
  const pulse = ramp(frame, hit, 8) * (1 - ramp(frame, hit + 8, 26));
  const halo = COVER_WORLD.size * lerp(1.5, 1.95, ramp(frame, enter, 40)) * (1 + 0.18 * pulse);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: COVER_WORLD.x + COVER_WORLD.size / 2 - halo,
          top: COVER_WORLD.y + COVER_WORLD.size / 2 - halo,
          width: halo * 2,
          height: halo * 2,
          background: glowOf(ramp(frame, enter, 14), 34 + Math.round(pulse * 20)),
        }}
      />
      <div style={{ position: "absolute", left: COVER_WORLD.x, top: COVER_WORLD.y, opacity: orb }}>
        <DitherCover id="quiet-hours-ii" size={Math.round(COVER_WORLD.size)} develop={develop} time={(frame / FPS) * 0.5} color={gold(1)} />
      </div>
    </>
  );
}

function AppWindow({ frame }: { frame: number }) {
  const { enter, travelled, settled } = S12_TIMES;
  const open = ramp(frame, enter + 20, settled - enter - 20, ease.inOut);
  const edge = (from: number, to: number) => lerp(from, to, open);
  const clip = `inset(${edge(COVER.y, 0)}px ${edge(PLATE.w - COVER.x - COVER.w, 0)}px ${edge(PLATE.h - COVER.y - COVER.h, 0)}px ${edge(COVER.x, 0)}px)`;
  const visible = ramp(frame, enter + 24, 10);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: WINDOW.x,
          top: WINDOW.y,
          width: PLATE.w,
          height: PLATE.h,
          transform: `scale(${K})`,
          transformOrigin: "0 0",
          clipPath: clip,
          opacity: visible,
        }}
      >
        <Img
          src={plateSrc("lyrics-full", "line-02")}
          style={{ width: "100%", height: "100%", display: "block", filter: "brightness(1.18)" }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: WINDOW.x,
          top: WINDOW.y,
          width: WINDOW.w,
          height: WINDOW_H,
          boxSizing: "border-box",
          border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
          opacity: ramp(frame, travelled + 30, 12),
        }}
      />
    </>
  );
}

function EndCard({ frame }: { frame: number }) {
  const { wordmark, tagline, thread, hit, settled } = S12_TIMES;
  const steady = frame >= settled;
  const line = ramp(frame, thread, 22, ease.inOut);
  const flash = ramp(frame, hit, 3) * (1 - ramp(frame, hit + 3, 14));
  return (
    <>
      <div style={{ position: "absolute", left: 96, top: 270 }}>
        <Wordmark font={104} at={wordmark} legible={steady} />
      </div>
      <div
        data-legible={steady ? "" : undefined}
        style={{ position: "absolute", left: 96, top: 440, fontSize: 96, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.06 }}
      >
        <MaskLine from={tagline} length={14}>
          {COPY.headline[0]}
        </MaskLine>
        <MaskLine from={tagline + 6} length={14} style={{ color: "var(--muted-foreground)" }}>
          {COPY.headline[1]}
        </MaskLine>
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          top: 700,
          width: 560 * line,
          height: 2,
          background: "var(--ignite)",
          boxShadow: `0 0 ${14 + flash * 30}px color-mix(in oklch, var(--ignite) ${50 + Math.round(flash * 50)}%, transparent)`,
        }}
      />
      <div style={{ position: "absolute", left: URL_AT.x, top: URL_AT.y, color: "var(--foreground)" }}>
        <MaskLine from={hit} length={8}>
          <span
            data-legible={steady ? "" : undefined}
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
          top: URL_AT.y + 64,
          width: WINDOW.w * ramp(frame, hit, 12, ease.out),
          height: 2,
          background: "var(--ignite)",
          opacity: 0.9,
        }}
      />
    </>
  );
}

function World() {
  const frame = useCurrentFrame();
  return (
    <Camera cam={camOf(viewAt(frame))}>
      <Cover frame={frame} />
      <AppWindow frame={frame} />
      <Command frame={frame} />
      <EndCard frame={frame} />
    </Camera>
  );
}

export function LandShot() {
  const frame = useCurrentFrame();
  const blur = frame >= SAFE_BLUR_FRAMES[0] && frame < SAFE_BLUR_FRAMES[1];
  return (
    <CameraBlur active={blur} samples={6} shutter={0.5} backdrop={VOID}>
      <World />
    </CameraBlur>
  );
}
