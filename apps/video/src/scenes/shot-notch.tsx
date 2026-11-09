import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { clock } from "../copy";
import { addCam, Camera, camAt, handheld, Layer } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bokeh } from "../design/dof";
import { Halation } from "../design/halation";
import { ease, hash, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { Chip } from "../ui/s7-chip";
import { ASSET, type IslandState, NotchIsland } from "../ui/s9-notch-island";
import { shotOf } from "./timelines";

const SHOT = shotOf("notch");
const g = (frame: number): number => frame / 30;

const HOVER = 50;
const CLICK_OPEN = 116;
const PRESS_PAUSE = 186;
const COLLAPSE = 190;
const HIDE = 202;
const GROW = 12;

export const NOTCH_CUES: readonly ShotCue[] = [
  { shot: "notch", at: 0, kind: "hit", label: "the notch" },
  { shot: "notch", at: HOVER, kind: "swell", label: "island grows on hover" },
  { shot: "notch", at: CLICK_OPEN, kind: "click", label: "click the island" },
  { shot: "notch", at: CLICK_OPEN + GROW, kind: "ping", label: "now playing opens" },
  { shot: "notch", at: PRESS_PAUSE, kind: "click", label: "pause" },
  { shot: "notch", at: COLLAPSE, kind: "swell", label: "island hides" },
];

const WIDTH = 1536;
const K = WIDTH / ASSET.w;
const LEFT = (1920 - WIDTH) / 2;
const stage = (x: number, y: number) => ({ x: LEFT + x * K, y: y * K });

const CURSOR: CursorStop[] = [
  { at: g(0), x: 1560, y: 520 },
  { at: g(HOVER - 4), ...stage(640, 40), dwell: 0.4 },
  { at: g(CLICK_OPEN), ...stage(640, 250), click: true, dwell: 0.3 },
  { at: g(PRESS_PAUSE), ...stage(640, 411), click: true },
];

const cameraAt = (scale: number, ry: number, x = 0) => ({ scale, ry, x, y: 540 * (1 - scale) });

/** The island's pose on a frame: grow on hover, grow on click, press pause, fold into the notch. */
function islandAt(frame: number): IslandState {
  const grow = (from: number, length: number) => ramp(frame, from, length, ease.inOut);
  const p = grow(HOVER, GROW) + grow(CLICK_OPEN, GROW + 2) - 2 * grow(COLLAPSE, GROW);
  const hide = ramp(frame, HIDE, GROW, ease.inOut);
  const seconds = 74 + frame / 60;
  const awake = frame < COLLAPSE;
  const bars = [0, 1, 2, 3].map((i) => {
    const wave = 0.5 + 0.5 * Math.sin(frame * (0.33 + i * 0.07) + i * 1.9);
    return awake ? 0.12 + 0.88 * (0.6 * wave + 0.4 * hash(Math.floor(frame / 3) * 4 + i)) : 0.05;
  });
  return {
    p,
    hide,
    progress: seconds / 222,
    played: clock(seconds),
    left: `-${clock(222 - seconds)}`,
    bars,
    press: ramp(frame, PRESS_PAUSE, 4) * (1 - ramp(frame, PRESS_PAUSE + 8, 8)),
    title: "signal violet pt. 2",
    artist: "satellite garden",
  };
}

/** The macOS notch island is the whole picture: compact, hover, open, then pause folds it away. */
export function NotchShot() {
  const frame = useCurrentFrame();
  const cam = addCam(
    camAt(frame, [
      { at: g(0), ...cameraAt(1.25, -2) },
      { at: g(HOVER), ...cameraAt(1.45, 1) },
      { at: g(CLICK_OPEN), ...cameraAt(1.35, -1) },
      { at: g(CLICK_OPEN + 20), ...cameraAt(1.2, 1) },
      { at: g(PRESS_PAUSE), ...cameraAt(1.22, 0) },
      { at: g(SHOT.frames - 2), ...cameraAt(1.55, 0) },
    ]),
    handheld(frame, 0.6),
  );
  const state = islandAt(frame);
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-60}>
          <div
            style={{ position: "absolute", left: -240, top: -140, width: 2400, height: 1300, overflow: "hidden", background: "#060606" }}
          >
            <div
              style={{
                position: "absolute",
                left: 660,
                top: 110,
                transform: "scale(1.8)",
                transformOrigin: "540px 540px",
                maskImage: "radial-gradient(circle at 50% 30%, #000 22%, transparent 66%)",
              }}
            >
              <DitherCover id="mac-wallpaper" size={1080} time={frame / 120} bare color="var(--foreground)" opacity={0.38} />
            </div>
          </div>
        </Layer>
        <Layer z={0}>
          <div style={{ position: "absolute", left: LEFT, top: 0 }}>
            <Halation strength={0.1} radius={34}>
              <NotchIsland state={state} width={WIDTH} />
            </Halation>
          </div>
          <Cursor stops={CURSOR} size={38 / cam.scale} />
        </Layer>
        <Bokeh focusZ={0} z={300} count={10} seed={5} opacity={0.2} />
      </Camera>
      <Chip text="lives in your notch" from={6} style={{ left: 70, top: 950 }} />
    </>
  );
}
