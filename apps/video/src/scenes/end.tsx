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
import { END } from "./timelines";

const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";

const GEOM = {
  wide: { orb: { x: 1230, y: 250, size: 520 }, mark: { x: 168, y: 150, font: 150 }, tag: { x: 168, y: 350, font: 92 }, box: { x: 168, y: 640, w: 940 }, url: { x: 168, y: 868 } },
  tall: { orb: { x: 280, y: 270, size: 520 }, mark: { x: 90, y: 850, font: 110 }, tag: { x: 90, y: 1010, font: 84 }, box: { x: 90, y: 1260, w: 900 }, url: { x: 90, y: 1470 } },
} as const;

function Wordmark({ font }: { font: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: font * 0.28, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: font, letterSpacing: "-0.04em", lineHeight: 1 }}>
      <svg aria-hidden width={font * 0.86} height={font * 0.86} viewBox="8 8 48 48" fill="currentColor">
        <path d={VEIN} />
      </svg>
      lodesong
    </div>
  );
}

export function EndShot() {
  const frame = useCurrentFrame();
  const { layout } = useLayout();
  const g = GEOM[layout];
  const T = END[layout];
  const time = frame / FPS;
  const orbDevelop = ramp(frame, beat(T.orb), beat(2.5), ease.inOut);
  const glow = ramp(frame, beat(T.orb), beat(2)) * 360;
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
          <div style={{ position: "absolute", left: g.orb.x, top: g.orb.y }}>
            <DitherCover id="quiet-hours-ii" size={g.orb.size} develop={orbDevelop} time={time * 0.5} color={gold(1)} />
          </div>
        </Layer>

        <Layer z={0}>
          <div style={{ position: "absolute", left: g.mark.x, top: g.mark.y }}>
            <MaskLine from={beat(T.mark)}>
              <div data-legible="">
                <Wordmark font={g.mark.font} />
              </div>
            </MaskLine>
          </div>
          <div
            data-legible=""
            style={{ position: "absolute", left: g.tag.x, top: g.tag.y, fontSize: g.tag.font, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.04 }}
          >
            <MaskLine from={beat(T.tagline)}>{COPY.headline[0]}</MaskLine>
            <MaskLine from={beat(T.tagline + 0.25)} style={{ color: "var(--muted-foreground)" }}>
              {COPY.headline[1]}
            </MaskLine>
          </div>
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
              fontSize: 28,
              lineHeight: 1.55,
              whiteSpace: "pre",
              opacity: ramp(frame, beat(T.lines - 0.5), beat(0.5)),
            }}
          >
            {FILM.end.docker.map((line, index) => (
              <MaskLine key={line} from={beat(T.lines + index * 0.5)}>
                <span data-legible="">{line}</span>
              </MaskLine>
            ))}
          </div>
          <div data-legible="" style={{ position: "absolute", left: g.url.x, top: g.url.y, opacity: ramp(frame, beat(T.url), beat(0.75)) }}>
            <Label style={{ fontSize: 32, color: "var(--foreground)", textTransform: "none", letterSpacing: "0.02em" }}>
              {FILM.end.url}
            </Label>
          </div>
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
