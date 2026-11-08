import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COPY, FILM } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { DitherWipe } from "../design/dither-wipe";
import { glowOf, gold } from "../design/gold";
import { Label, MaskLine } from "../design/kinetic";
import { useLayout } from "../design/layout";
import { ease, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { GoldTransit } from "../ui/gold-transit";
import { END } from "./timelines";

const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";
const QUICK = beat(0.5);

const GEOM = {
  wide: {
    orb: { x: 1340, y: 240, size: 480 },
    mark: { x: 168, y: 100, font: 150 },
    tag: { x: 168, y: 290, font: 92 },
    box: { x: 168, y: 560, w: 1150 },
    url: { x: 168, y: 830, font: 48 },
    code: 34,
  },
  tall: {
    orb: { x: 280, y: 330, size: 520 },
    mark: { x: 90, y: 940, font: 120 },
    tag: { x: 90, y: 1110, font: 100 },
    box: { x: 90, y: 1260, w: 900 },
    url: { x: 90, y: 1360, font: 44 },
    code: 28,
  },
} as const;

const ARRIVE = { wide: { cx: 298, cy: 550, size: 128 }, tall: { cx: 805, cy: 1130, size: 220 } };

function Wordmark({ font, lode, song }: { font: number; lode: number; song: number }) {
  return (
    <div
      data-legible=""
      style={{
        display: "flex",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: font,
        letterSpacing: "-0.04em",
        lineHeight: 1.1,
      }}
    >
      <MaskLine from={lode} length={QUICK}>
        <div style={{ display: "flex", alignItems: "center", gap: font * 0.28 }}>
          <svg aria-hidden width={font * 0.86} height={font * 0.86} viewBox="8 8 48 48" fill="currentColor">
            <path d={VEIN} />
          </svg>
          lode
        </div>
      </MaskLine>
      <MaskLine from={song} length={QUICK}>
        song
      </MaskLine>
    </div>
  );
}

export function EndShot() {
  const frame = useCurrentFrame();
  const { layout } = useLayout();
  const g = GEOM[layout];
  const T = END[layout];
  const time = frame / FPS;
  const arrival = ramp(frame, beat(T.orb - 0.25), beat(1.5), ease.inOut);
  const landed = arrival >= 1;
  const glow = arrival * 360;
  const cam = camAt(frame, [
    { at: 0, scale: 1.05, ry: layout === "wide" ? 4 : 0 },
    { at: T.end, scale: 1.0, ry: 0 },
  ]);
  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Layer z={-300}>
          <AbsoluteFill style={{ opacity: 0.1, maskImage: "radial-gradient(circle at 70% 45%, black 0, transparent 620px)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
              <DitherCover id="end-field" size={1080} time={time * 0.4} />
            </div>
          </AbsoluteFill>
        </Layer>

        <Layer z={50}>
          <div
            style={{
              position: "absolute",
              left: g.orb.x + g.orb.size / 2 - glow,
              top: g.orb.y + g.orb.size / 2 - glow,
              width: glow * 2,
              height: glow * 2,
              background: glowOf(1, 30),
            }}
          />
          <div style={{ position: "absolute", left: g.orb.x, top: g.orb.y, opacity: landed ? 1 : 0 }}>
            <DitherCover id="quiet-hours-ii" size={g.orb.size} time={time * 0.5} color={gold(1)} />
          </div>
          <GoldTransit
            from={ARRIVE[layout]}
            to={{ cx: g.orb.x + g.orb.size / 2, cy: g.orb.y + g.orb.size / 2, size: g.orb.size }}
            progress={arrival}
            time={time}
          />
        </Layer>

        <Layer z={0}>
          <div style={{ position: "absolute", left: g.mark.x, top: g.mark.y }}>
            <Wordmark font={g.mark.font} lode={beat(T.mark)} song={beat(T.song)} />
          </div>
          <div
            data-legible=""
            style={{
              position: "absolute",
              left: g.tag.x,
              top: g.tag.y,
              fontSize: g.tag.font,
              fontWeight: 500,
              letterSpacing: "-0.045em",
              lineHeight: 1.04,
            }}
          >
            <MaskLine from={beat(T.tagline)} length={QUICK}>
              {COPY.headline[0]}
            </MaskLine>
            <MaskLine from={beat(T.tagline + 0.25)} length={QUICK} style={{ color: "var(--muted-foreground)" }}>
              {COPY.headline[1]}
            </MaskLine>
          </div>
          {layout === "wide" ? (
            <div
              style={{
                position: "absolute",
                left: g.box.x,
                top: g.box.y,
                width: g.box.w,
                padding: "26px 32px",
                border: "1px solid color-mix(in oklch, var(--foreground) 28%, transparent)",
                background: "#050505",
                fontFamily: "var(--font-mono)",
                fontSize: g.code,
                lineHeight: 1.55,
                whiteSpace: "pre",
                opacity: ramp(frame, beat(T.lines - 0.25), beat(0.25)),
              }}
            >
              {FILM.end.docker.map((line, index) => (
                <MaskLine key={line} from={beat(T.lines + index * 0.25)} length={QUICK}>
                  <span data-legible="">{line}</span>
                </MaskLine>
              ))}
            </div>
          ) : null}
          <div style={{ position: "absolute", left: g.url.x, top: g.url.y, opacity: ramp(frame, beat(T.url), beat(0.25)) }}>
            <Label legible style={{ fontSize: g.url.font, color: "var(--foreground)", textTransform: "none", letterSpacing: "0.02em" }}>
              {FILM.end.url}
            </Label>
          </div>
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
