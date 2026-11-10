import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { COPY, FILM } from "../copy";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { glowOf } from "../design/gold";
import { MaskLine } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Caret, typedCount } from "../design/typing";
import { COVER, driftCam, GoldCover } from "./cut-kit";
import { Wordmark } from "./shot-land";
import { cutOf } from "./timelines";

const SHOT = cutOf("land");
const COMMAND = "docker run -d -p 8080:8080 …";
const TYPE_AT = 22;
const LANDINGS = Array.from(COMMAND, (_, i) => TYPE_AT + Math.floor(i / 2.4));
const TYPED_DONE = LANDINGS.at(-1) ?? TYPE_AT;
const HIT_AT = SHOT.beat(2);
const SETTLED = HIT_AT + 24;
const URL_Y = 1462;

export const CUT_LAND_CUES: readonly ShotCue[] = [
  { shot: "land", at: 0, kind: "kick", label: "ignite: the cover lights for the end card" },
  { shot: "land", at: 4, kind: "tick", label: "wordmark rises" },
  { shot: "land", at: 14, kind: "tick", label: "tagline rises" },
  ...LANDINGS.map((at, i): ShotCue => ({ shot: "land", at, kind: "typed", label: `type: ${COMMAND[i]}` })),
  { shot: "land", at: HIT_AT + 4, kind: "tick", label: "underline draws under the url" },
];

/** Cut 6: the cover lights gold in the same slot it opened in, the name, the promise and the one command stack under it, and the url lands on the last hit. */
export function LandScene() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, SHOT.frames, { scale: { from: 1.04, to: 1 }, y: { from: -12, to: 0 }, ry: { from: 2, to: 0 } });
  const lit = ramp(frame, 0, 10);
  const halo = lerp(0.9, 0.32, ramp(frame, 2, 40));
  const typed = typedCount(frame, LANDINGS);
  const typing = frame >= TYPE_AT && typed < COMMAND.length;
  const flash = ramp(frame, HIT_AT, 3) * (1 - ramp(frame, HIT_AT + 3, 14));
  const steady = frame >= SETTLED;
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-120}>
          <div
            style={{
              position: "absolute",
              left: COVER.x - 300,
              top: COVER.y - 240,
              width: COVER.size + 600,
              height: COVER.size + 600,
              background: glowOf(halo * lit, 40),
            }}
          />
        </Layer>
        <Layer z={70}>
          <div style={{ position: "absolute", left: COVER.x, top: COVER.y }}>
            <GoldCover develop={0.5 + 0.5 * ramp(frame, 0, 24)} />
          </div>
        </Layer>
        <Bokeh focusZ={0} z={300} count={8} seed={17} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1078, display: "flex", justifyContent: "center" }}>
        <Wordmark font={136} at={2} legible={steady} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1244, display: "flex", justifyContent: "center" }}>
        <div
          data-legible={steady ? "" : undefined}
          style={{ fontSize: 70, fontWeight: 500, letterSpacing: "-0.04em", whiteSpace: "nowrap" }}
        >
          <MaskLine from={12} length={14}>
            {COPY.headline[0]} <span style={{ color: "var(--muted-foreground)" }}>{COPY.headline[1]}</span>
          </MaskLine>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1362, display: "flex", justifyContent: "center" }}>
        <div
          data-legible={typed >= COMMAND.length && steady ? "" : undefined}
          style={{ fontFamily: "var(--font-mono)", fontSize: 46, whiteSpace: "pre" }}
        >
          {COMMAND.slice(0, typed)}
          {frame >= TYPE_AT && !(typed >= COMMAND.length && frame > TYPED_DONE + 20) ? (
            <Caret frame={frame} typing={typing} size={46} />
          ) : null}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: URL_Y, display: "flex", justifyContent: "center" }}>
        <MaskLine from={HIT_AT} length={8}>
          <span
            data-legible={frame >= HIT_AT + 10 ? "" : undefined}
            style={{ fontFamily: "var(--font-mono)", fontSize: 50, letterSpacing: "0.01em", fontWeight: 500, color: "var(--foreground)" }}
          >
            {FILM.end.url}
          </span>
        </MaskLine>
      </div>
      <div
        style={{
          position: "absolute",
          left: (1080 - 840) / 2,
          top: URL_Y + 76,
          width: 840 * ramp(frame, HIT_AT + 2, 14, ease.out),
          height: 3,
          background: "var(--ignite)",
          boxShadow: `0 0 ${10 + flash * 34}px color-mix(in oklch, var(--ignite) ${40 + Math.round(flash * 60)}%, transparent)`,
        }}
      />
    </>
  );
}
