import { Img, useCurrentFrame } from "remotion";
import { plateBox, plateSrc } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import { Camera, camAt, Layer } from "../design/camera";
import { Bokeh, DofLayer, focusAt } from "../design/dof";
import { Halation } from "../design/halation";
import { MaskLine } from "../design/kinetic";
import { ease, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { ShotChip } from "../ui/s1-chip";

const COVER = 600;
const COVER_AT = { x: 200, y: 240 };
const MID = 540;
const HEADLINE = 130;

const HAIRLINE_FRAMES = 6;
const COVER_FROM = 2;
const COVER_FRAMES = 22;
const MUSIC_AT = 36;
const SERVER_AT = 72;
const CHIP_AT = 44;

export const S1_CUES: readonly ShotCue[] = [
  { shot: "cold-open", at: 0, kind: "tick", label: "hairline draws" },
  { shot: "cold-open", at: COVER_FROM + 4, kind: "swell", label: "cover resolves from dots" },
  { shot: "cold-open", at: MUSIC_AT, kind: "ping", label: "your music. (E5)" },
  { shot: "cold-open", at: SERVER_AT, kind: "ping", label: "your server. (A5)" },
  { shot: "cold-open", at: 136, kind: "hit", label: "2 frames of silence, then the cut" },
];

const g = (frame: number): number => frame / 30;

const CAM = [
  { at: 0, scale: 1.05, x: -16 },
  { at: g(144), scale: 1, x: 0 },
];

const RACK = [
  { at: g(2), z: 300 },
  { at: g(14), z: 0 },
];

/** The real player bar of the capture, cropped to its left 1100 px and shown at 1.75x: real product on the very first frame. */
const BAR = plateBox("player-bar", "bar", "bar");
const BAR_K = 1.75;

/** S1: a hairline opens like a lid onto the monochrome dither cover, then the two-line promise rises beside it. */
export function ColdOpenShot() {
  const frame = useCurrentFrame();
  const cam = camAt(frame, CAM, ease.out);
  const focusZ = focusAt(frame, RACK);
  const line = ramp(frame, 0, HAIRLINE_FRAMES, ease.inOut);
  const lid = ramp(frame, COVER_FROM, COVER_FRAMES, ease.out);
  const develop = ramp(frame, COVER_FROM + 2, COVER_FRAMES, ease.inOut);
  const rest = `${((1 - lid) * 50).toFixed(2)}%`;
  return (
    <Camera cam={cam}>
      <DofLayer z={0} focusZ={focusZ} aperture={0.03}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: MID - 1,
            height: 2,
            width: 1920 * line,
            background: "color-mix(in oklch, var(--ignite) 46%, transparent)",
          }}
        />
        <div style={{ position: "absolute", left: COVER_AT.x, top: COVER_AT.y, width: COVER, height: COVER, clipPath: `inset(${rest} 0)` }}>
          <Halation fill strength={0.14} radius={30}>
            <DitherCover id="signal violet pt. 2" size={COVER} develop={develop} time={frame / 90} />
          </Halation>
        </div>
        <div style={{ position: "absolute", left: 930, top: MID - HEADLINE * 1.05, width: 900 }}>
          <MaskLine from={MUSIC_AT} length={20}>
            <div
              style={{ fontSize: HEADLINE, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.05, color: "var(--foreground)" }}
              data-legible=""
            >
              your music.
            </div>
          </MaskLine>
          <MaskLine from={SERVER_AT} length={20}>
            <div
              style={{
                fontSize: HEADLINE,
                fontWeight: 500,
                letterSpacing: "-0.045em",
                lineHeight: 1.05,
                color: "color-mix(in oklch, var(--foreground) 72%, transparent)",
              }}
              data-legible=""
            >
              your server.
            </div>
          </MaskLine>
        </div>
        <ShotChip text="lodesong · music player" from={CHIP_AT} left={COVER_AT.x} top={COVER_AT.y + COVER + 24} />
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
            filter: "brightness(1.5)",
          }}
        >
          <Img
            src={plateSrc("player-bar", "bar")}
            style={{ position: "absolute", left: 0, top: -BAR.y * BAR_K, width: 1440 * BAR_K, height: 810 * BAR_K, maxWidth: "none" }}
          />
        </div>
      </Layer>
      <Bokeh focusZ={focusZ} z={300} count={14} seed={7} />
    </Camera>
  );
}
