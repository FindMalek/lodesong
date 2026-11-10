import { plateBox, plateSrc } from "../captures/film-manifest";
import { Camera, type CamKey, camAt, Layer, STAGE } from "../design/camera";
import { Bokeh, DofLayer } from "../design/dof";
import { gold } from "../design/gold";
import { Halation } from "../design/halation";
import { MaskLine } from "../design/kinetic";
import { ease, edgeFade, lerp, ramp } from "../design/motion";
import { Plate } from "../design/plate";
import type { Box } from "../design/probe";
import { PLATE } from "../scenes/s2-palette";
import { DitherCover } from "./dither-cover";

const g = (frame: number): number => frame / 30;

export const IGNITE_AT = 4;
const IGNITE_FRAMES = 18;
export const LIFT_AT = 28;
const LIFT_FRAMES = 40;
const LIT_AT = [72, 124] as const;
const LIT_FRAMES = 8;
const SCROLL_AT = 112;
const LYRICS = ["turn it up and let it ring", "I keep the lights on for you", "the quiet between the neon"] as const;
const PITCH = 98;

/** Real player bar of the captured app (1440x810 px plate): the cover, the seek track and its handle. */
const COVER: Box = { x: 13.5, y: 756.5, w: 43, h: 43 };
const TRACK = { from: 494, to: 558, y: 793.5, h: 3.4 };
const HANDLE: Box = plateBox("play-from-line", "after", "seek");

/** Where the gold cover lands: the same place and size as the S4 full-screen cover, so the cut is a match. */
const COVER_END = { x: 54, y: 66, size: 646 };
const LYRIC_X = 822;
const LYRIC_SIZE = 58;

const BAR_KEYS: CamKey[] = [
  { at: 0, scale: 2, x: -960, y: 540, rx: 0, ry: 0 },
  { at: g(LIFT_AT), scale: 2.2, x: -1152, y: 648, rx: 0, ry: 0 },
];

const END_KEYS = [
  { at: g(LIFT_AT), scale: 1 },
  { at: g(140), scale: 1.045 },
  { at: g(267), scale: 1 },
];

export const lyricCues = LIT_AT.map((at, i) => ({ at, text: LYRICS[i + 1] ?? "" }));

const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** Where a point of the plate lands on screen once the camera has settled (flat: no yaw, no pitch). */
function screenOf(cam: { x: number; y: number; scale: number }, p: { x: number; y: number }): { x: number; y: number } {
  const sx = p.x * PLATE.k;
  const sy = p.y * PLATE.k;
  return {
    x: STAGE.w / 2 + (sx - STAGE.w / 2) * cam.scale - cam.x,
    y: STAGE.h / 2 + (sy - STAGE.h / 2) * cam.scale - cam.y,
  };
}

const settled = camAt(LIFT_AT, BAR_KEYS);
const startSize = COVER.w * PLATE.k * settled.scale;
const startAt = screenOf(settled, { x: COVER.x, y: COVER.y });

const IGNITE_ID = "signal fires ii";
const SMALL = 172;

/** The plate's own player bar, lit: gold spreads out of the cover as a dither wave and fills the seek track up to where the song starts. */
function Ignite({ t }: { t: number }) {
  const wave = ramp(t, IGNITE_AT, IGNITE_FRAMES, ease.out);
  const fill = ramp(t, IGNITE_AT + 2, IGNITE_FRAMES - 2, ease.out);
  const scale = COVER.w / SMALL;
  const flash = ramp(t, IGNITE_AT, 6) * (1 - ramp(t, IGNITE_AT + 6, 30));
  return (
    <>
      <i
        style={{
          position: "absolute",
          left: COVER.x + COVER.w / 2 - 260,
          top: COVER.y + COVER.h / 2 - 260,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, color-mix(in oklch, var(--ignite) 70%, transparent), transparent 66%)",
          opacity: flash,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: COVER.x,
          top: COVER.y,
          width: COVER.w,
          height: COVER.h,
          overflow: "hidden",
          clipPath: `circle(${wave * 76}% at 50% 50%)`,
        }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: SMALL, height: SMALL }}>
          <DitherCover id={IGNITE_ID} size={SMALL} color="var(--ignite)" time={t / 90} opacity={1} />
        </div>
      </div>
      {fill > 0 ? (
        <>
          <i
            style={{
              position: "absolute",
              left: TRACK.from,
              top: TRACK.y,
              width: (TRACK.to - TRACK.from) * fill,
              height: TRACK.h,
              background: "var(--ignite)",
              boxShadow: "0 0 8px 1px var(--ignite)",
            }}
          />
          <i
            style={{
              position: "absolute",
              left: HANDLE.x,
              top: HANDLE.y,
              width: HANDLE.w,
              height: HANDLE.h,
              background: "var(--ignite)",
              opacity: ramp(t, IGNITE_AT + IGNITE_FRAMES - 6, 6),
            }}
          />
        </>
      ) : null}
    </>
  );
}

function Finale({ t }: { t: number }) {
  const lift = ramp(t, LIFT_AT, LIFT_FRAMES, ease.inOut);
  const size = lerp(startSize, COVER_END.size, lift);
  const at = mix(startAt, COVER_END, lift);
  const cam = camAt(t, END_KEYS);
  const bloom = ramp(t, LIFT_AT + 10, 40);
  return (
    <Camera cam={{ ...cam, x: 0, y: 0, rx: 0, ry: 0 }}>
      <Layer z={-120}>
        <div
          style={{
            position: "absolute",
            left: -80,
            top: 0,
            width: 1500,
            height: 1080,
            background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 52%, transparent), transparent)",
            opacity: 0.8 * bloom,
          }}
        />
      </Layer>
      <DofLayer z={0} focusZ={0} aperture={0.03}>
        <Halation fill strength={0.1} radius={34}>
          <div style={{ position: "absolute", left: at.x, top: at.y, width: size, height: size, overflow: "hidden" }}>
            <div style={{ transform: `scale(${size / 646})`, transformOrigin: "0 0", width: 646, height: 646 }}>
              <DitherCover id={IGNITE_ID} size={646} color="var(--ignite)" time={t / 90} opacity={1} />
            </div>
          </div>
        </Halation>
        {LYRICS.map((line, index) => {
          const focus = ramp(t, SCROLL_AT, 20, ease.inOut);
          const y = 540 - PITCH / 2 + (index - 1 - focus) * PITCH;
          const weight = index === 1 + Math.round(focus) ? 1 : 0.62;
          const lit = index === 0 ? 0 : ramp(t, LIT_AT[index - 1] ?? 0, LIT_FRAMES);
          return (
            <div
              key={line}
              style={{
                position: "absolute",
                left: LYRIC_X,
                top: y,
                width: 1000,
                opacity: weight * edgeFade(y / 1080, [0.1, 0.26, 0.74, 0.9]),
              }}
            >
              <MaskLine from={LIT_AT[0] - 26 + index * 10} length={22}>
                <Halation strength={lit * 0.34} radius={22}>
                  <div
                    style={{
                      fontSize: LYRIC_SIZE,
                      fontWeight: 650,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.12,
                      color: lit > 0 ? gold(lit) : "color-mix(in oklch, var(--foreground) 46%, transparent)",
                    }}
                    data-legible=""
                  >
                    {line}
                  </div>
                </Halation>
              </MaskLine>
            </div>
          );
        })}
      </DofLayer>
      <Bokeh focusZ={0} z={300} count={12} seed={11} opacity={0.26} />
    </Camera>
  );
}

/** S3 as one view in shot-local frames `t`: the real bar lights up, then the cover lifts out of it into the S4 layout with the line being sung. */
export function BarView({ t }: { t: number }) {
  const cam = camAt(t, BAR_KEYS);
  const dim = ramp(t, LIFT_AT + 12, 28);
  const caretPool = ramp(t, IGNITE_AT + 2, 14, ease.inOut);
  const back = ramp(t, 22, 14, ease.inOut);
  const pool = mix(mix({ x: 35, y: 778 }, { x: 558, y: 795 }, caretPool), { x: 120, y: 778 }, back);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1 - dim,
          filter: dim > 0 ? `brightness(${1 - dim * 0.6}) blur(${dim * 7}px)` : undefined,
        }}
      >
        <Camera cam={cam}>
          <Plate
            src={plateSrc("play-from-line", "after")}
            layout={PLATE}
            focusZ={0}
            brightness={1.7}
            light={{ x: pool.x, y: pool.y, radius: 420, dim: 0.62, wash: 0.1 }}
          >
            <Ignite t={t} />
          </Plate>
        </Camera>
      </div>
      {t >= LIFT_AT - 1 ? <Finale t={t} /> : null}
    </div>
  );
}
