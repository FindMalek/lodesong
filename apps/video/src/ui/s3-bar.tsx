import { plateBox, plateSrc } from "../captures/film-manifest";
import { Camera, type CamKey, camAt, Layer, STAGE } from "../design/camera";
import { Bokeh, DofLayer } from "../design/dof";
import { Halation } from "../design/halation";
import { KaraokeLine, wordsOf } from "../design/karaoke-fill";
import { MaskLine } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Plate } from "../design/plate";
import type { Box } from "../design/probe";
import { PLATE } from "../scenes/s2-palette";
import { DitherCover } from "./dither-cover";

const g = (frame: number): number => frame / 30;

export const IGNITE_AT = 9;
const IGNITE_FRAMES = 20;
export const LIFT_AT = 78;
const LIFT_FRAMES = 64;
const LINE_AT = 140;
const LINE_FRAMES = 84;
const LYRIC = "I keep the lights on for you";
const LYRIC_BEFORE = "turn it up and let it ring";
const LYRIC_AFTER = "the quiet between the neon";

/** Real player bar of the captured app (1440x810 px plate): the cover, the seek track and its handle. */
const COVER: Box = { x: 13.5, y: 756.5, w: 43, h: 43 };
const TRACK = { from: 494, to: 558, y: 793.5, h: 3.4 };
const HANDLE: Box = plateBox("play-from-line", "after", "seek");

/** Where the gold cover lands: the same place and size as the S4 full-screen cover, so the cut is a match. */
const COVER_END = { x: 54, y: 66, size: 646 };
const LYRIC_X = 822;
const LYRIC_SIZE = 58;

/** The bar sits at the very foot of the capture, so this camera leaves the plate: the bar floats in the void, the plate's left edge pinned to the frame edge. */
const BAR_KEYS: CamKey[] = [
  { at: 0, scale: 2.3, x: -1248, y: 950, rx: 0, ry: -3 },
  { at: g(LIFT_AT), scale: 2.9, x: -1824, y: 1281, rx: 0, ry: 0 },
];

const END_KEYS = [
  { at: g(LIFT_AT), scale: 1 },
  { at: g(LIFT_AT + LIFT_FRAMES), scale: 1.02 },
  { at: g(267), scale: 1 },
];

const lyricWords = wordsOf(LYRIC, g(LINE_AT), g(LINE_FRAMES));

export const lyricCues = lyricWords.map((word) => ({ at: Math.round(word.at * 30), text: word.text }));

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
  return (
    <>
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
  const bloom = ramp(t, LIFT_AT + 20, 50);
  return (
    <Camera cam={{ ...cam, x: 0, y: 0, rx: 0, ry: 0 }}>
      <Layer z={-120}>
        <div
          style={{
            position: "absolute",
            left: 40,
            top: 120,
            width: 1100,
            height: 840,
            background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 34%, transparent), transparent)",
            opacity: 0.8 * bloom,
          }}
        />
      </Layer>
      <DofLayer z={0} focusZ={0} aperture={0.03}>
        <Halation fill strength={0.24} radius={34}>
          <div style={{ position: "absolute", left: at.x, top: at.y, width: size, height: size, overflow: "hidden" }}>
            <div style={{ transform: `scale(${size / 646})`, transformOrigin: "0 0", width: 646, height: 646 }}>
              <DitherCover id={IGNITE_ID} size={646} color="var(--ignite)" time={t / 90} opacity={1} />
            </div>
          </div>
        </Halation>
        <div style={{ position: "absolute", left: LYRIC_X, top: 380, width: 1000, display: "flex", flexDirection: "column", gap: 26 }}>
          <MaskLine from={LINE_AT - 26} length={22}>
            <div
              style={{
                fontSize: LYRIC_SIZE,
                fontWeight: 650,
                letterSpacing: "-0.02em",
                color: "color-mix(in oklch, var(--foreground) 34%, transparent)",
              }}
            >
              {LYRIC_BEFORE}
            </div>
          </MaskLine>
          <MaskLine from={LINE_AT - 16} length={22}>
            <Halation strength={0.3} radius={22}>
              <KaraokeLine words={lyricWords} size={LYRIC_SIZE} />
            </Halation>
          </MaskLine>
          <MaskLine from={LINE_AT - 6} length={22}>
            <div
              style={{
                fontSize: LYRIC_SIZE,
                fontWeight: 650,
                letterSpacing: "-0.02em",
                color: "color-mix(in oklch, var(--foreground) 34%, transparent)",
              }}
            >
              {LYRIC_AFTER}
            </div>
          </MaskLine>
        </div>
      </DofLayer>
      <Bokeh focusZ={0} z={300} count={12} seed={11} opacity={0.26} />
    </Camera>
  );
}

/** S3 as one view in shot-local frames `t`: the real bar lights up, then the cover lifts out of it into the S4 layout with the line being sung. */
export function BarView({ t }: { t: number }) {
  const cam = camAt(t, BAR_KEYS);
  const dim = ramp(t, LIFT_AT + 14, 50);
  const caretPool = ramp(t, IGNITE_AT + 4, 24, ease.inOut);
  const back = ramp(t, 46, 30, ease.inOut);
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
            light={{ x: pool.x, y: pool.y, radius: 360, dim: 0.55, wash: 0.12 }}
          >
            <Ignite t={t} />
          </Plate>
        </Camera>
      </div>
      {t >= LIFT_AT - 1 ? <Finale t={t} /> : null}
    </div>
  );
}
