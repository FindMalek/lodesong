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

const OPEN_AT = 0;
const LYRICS_AT = 88;
const COLLAPSE = 170;
const HIDE = 186;
const GROW = 16;
const SWITCH = 10;

export const NOTCH_CUES: readonly ShotCue[] = [
  { shot: "notch", at: 0, kind: "hit", label: "the notch" },
  { shot: "notch", at: OPEN_AT, kind: "click", label: "click the island" },
  { shot: "notch", at: OPEN_AT + GROW, kind: "ping", label: "now playing opens" },
  { shot: "notch", at: LYRICS_AT, kind: "click", label: "lyrics tab" },
  { shot: "notch", at: COLLAPSE, kind: "swell", label: "paused, the island hides" },
];

const WIDTH = 1536;
const K = WIDTH / ASSET.w;
const LEFT = (1920 - WIDTH) / 2;
const stage = (x: number, y: number) => ({ x: LEFT + x * K, y: y * K });

const CURSOR: CursorStop[] = [
  { at: g(0), x: 1500, y: 150 },
  { at: g(OPEN_AT), ...stage(640, 38), click: true, dwell: 0.3 },
  { at: g(LYRICS_AT), ...stage(672, 214), click: true, dwell: 0.3 },
  { at: g(LYRICS_AT + 40), x: 1560, y: 420 },
];

const cameraAt = (scale: number, ry: number, x = 0) => ({ scale, ry, x, y: 540 * (1 - scale) });

/** The island's pose on a frame: grow on hover, grow on click, press pause, fold into the notch. */
function islandAt(frame: number): IslandState {
  const grow = (from: number, length: number) => ramp(frame, from, length, ease.inOut);
  const p = 2 * grow(OPEN_AT, GROW) - 2 * grow(COLLAPSE, GROW);
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
    lyrics: grow(LYRICS_AT, SWITCH),
    title: "static mirror at night",
    artist: "orchard static",
  };
}

/** The macOS notch island is the whole picture: compact, a click opens now playing, the lyrics tab follows along, then pause folds it away. */
export function NotchShot() {
  const frame = useCurrentFrame();
  const cam = addCam(
    camAt(frame, [
      { at: g(0), ...cameraAt(1.5, -2) },
      { at: g(OPEN_AT), ...cameraAt(1.5, 1) },
      { at: g(OPEN_AT + 22), ...cameraAt(1.2, -1) },
      { at: g(LYRICS_AT), ...cameraAt(1.24, 1) },
      { at: g(COLLAPSE), ...cameraAt(1.26, 0) },
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
            style={{ position: "absolute", left: -240, top: -140, width: 2400, height: 1300, overflow: "hidden", background: "#0b0b0b" }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse 1100px 760px at 50% 24%, color-mix(in oklch, var(--ignite) 72%, #0b0b0b), color-mix(in oklch, var(--ignite) 14%, #0b0b0b) 55%, #0b0b0b 85%)",
              }}
            />
            <div style={{ position: "absolute", left: 660, top: 110, transform: "scale(1.8)", transformOrigin: "540px 540px" }}>
              <DitherCover id="mac-wallpaper" size={1080} time={frame / 120} bare color="var(--ignite)" opacity={0.6} />
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
