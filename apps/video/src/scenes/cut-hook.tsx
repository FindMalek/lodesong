import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { glowOf } from "../design/gold";
import { ease, ramp } from "../design/motion";
import { DitherText } from "../ui/s1-dither-text";
import { COVER, CutChip, driftCam, GoldCover } from "./cut-kit";
import { Wordmark } from "./shot-land";
import { cutOf } from "./timelines";

const FRAMES = cutOf("hook").frames;
const LINES = ["i keep the", "lights on"] as const;
const LINE_AT = [6, 18] as const;
const LINE_Y = [1076, 1200] as const;
const CHIP_AT = 30;
const MARK_AT = 54;

export const CUT_HOOK_CUES: readonly ShotCue[] = [
  { shot: "hook", at: MARK_AT, kind: "tick", label: "wordmark rises" },
  { shot: "hook", at: LINE_AT[0] + 8, kind: "ping", label: "lyric forms from dots: i keep the" },
  { shot: "hook", at: LINE_AT[1] + 8, kind: "ping", label: "lyric forms from dots: lights on" },
  { shot: "hook", at: CHIP_AT + 6, kind: "tick", label: "chip settles" },
];

/** Cut 1: the cover cools from the end card's gold into dots while the lyric forms under it. Product and promise inside the first second. */
export function HookScene() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, FRAMES, { scale: { from: 1, to: 1.05 }, y: { from: 0, to: -14 }, ry: { from: -2.5, to: 1 } });
  const cool = ramp(frame, 0, 26);
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-120}>
          <div
            style={{
              position: "absolute",
              left: COVER.x - 260,
              top: COVER.y - 200,
              width: COVER.size + 520,
              height: COVER.size + 520,
              background: glowOf(0.5 * (1 - cool) + 0.12, 40),
            }}
          />
        </Layer>
        <Layer z={70}>
          <div style={{ position: "absolute", left: COVER.x, top: COVER.y }}>
            <GoldCover sat={1 - cool} develop={0.55 + 0.45 * ramp(frame, 0, 30)} />
          </div>
        </Layer>
        <Layer z={0}>
          {LINES.map((line, i) => (
            <div key={line} style={{ position: "absolute", left: COVER.x, top: LINE_Y[i] }}>
              <DitherText
                text={line}
                size={124}
                width={900}
                height={150}
                progress={ramp(frame, LINE_AT[i] ?? 0, 22, ease.inOut)}
                color={i === 1 ? "color-mix(in oklch, var(--foreground) 88%, var(--ignite))" : "var(--foreground)"}
                glow={i === 1 ? 0.5 : 0.18}
              />
            </div>
          ))}
        </Layer>
        <Bokeh focusZ={0} z={300} count={8} seed={3} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <div style={{ position: "absolute", left: 0, right: 0, top: 266, display: "flex", justifyContent: "center" }}>
        <Wordmark font={54} at={MARK_AT} legible={frame >= MARK_AT + 16} />
      </div>
      <CutChip text="find a song by its lyric" from={CHIP_AT} />
    </>
  );
}
