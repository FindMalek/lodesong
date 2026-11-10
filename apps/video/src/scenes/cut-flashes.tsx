import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { clock } from "../copy";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { glowOf } from "../design/gold";
import { Halation } from "../design/halation";
import { ease, hash, lerp, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { filmPlate } from "../ui/s8-real-crop";
import { ASSET, type IslandState, NotchIsland } from "../ui/s9-notch-island";
import { DitherReveal } from "../ui/themes-reveal";
import { CutChip, driftCam, Hit, PlateWindow, Stamp } from "./cut-kit";
import { cutOf } from "./timelines";

const SHOT = cutOf("shells");
const NOTCH_FRAMES = SHOT.beat(1);
const THEMES_AT = NOTCH_FRAMES;
const KEYS_AT = SHOT.beat(3);
const LOOK_AT = [0, 18, 37] as const;
const LOOKS = ["paper", "slate", "terminal"] as const;
const REVEAL = 9;
const KEY_STRIKE = 3;

export const CUT_FLASHES_CUES: readonly ShotCue[] = [
  { shot: "shells", at: 4, kind: "click", label: "click the island" },
  { shot: "shells", at: 10, kind: "ping", label: "now playing opens" },
  { shot: "shells", at: 18, kind: "click", label: "lyrics tab" },
  ...LOOK_AT.map(
    (at, i): ShotCue => ({ shot: "shells", at: THEMES_AT + at, kind: i === 0 ? "hit" : "pluck", label: `look: ${LOOKS[i]} tile` }),
  ),
  { shot: "shells", at: THEMES_AT + 6, kind: "tick", label: "chip settles" },
  { shot: "shells", at: KEYS_AT + KEY_STRIKE, kind: "key", label: "question mark" },
  { shot: "shells", at: KEYS_AT + KEY_STRIKE + 2, kind: "tick", label: "chip settles" },
];

const ISLAND_WIDTH = 1260;
const ISLAND_TOP = 400;

function islandAt(frame: number): IslandState {
  const grow = (from: number, length: number) => ramp(frame, from, length, ease.inOut);
  const seconds = 74 + frame / 60;
  return {
    p: 2 * grow(2, 12),
    hide: 0,
    progress: seconds / 222,
    played: clock(seconds),
    left: `-${clock(222 - seconds)}`,
    bars: [0, 1, 2, 3].map(
      (i) => 0.12 + 0.88 * (0.6 * (0.5 + 0.5 * Math.sin(frame * (0.33 + i * 0.07) + i * 1.9)) + 0.4 * hash(Math.floor(frame / 3) * 4 + i)),
    ),
    lyrics: grow(10, 8),
    title: "signal violet pt. 2",
    artist: "satellite garden",
  };
}

function Notch() {
  const frame = useCurrentFrame();
  const s = lerp(1, 1.06, ramp(frame, 0, NOTCH_FRAMES));
  const cam = { x: 0, y: -(s - 1) * 500, scale: s, rx: 0, ry: 0 };
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-60}>
          <div style={{ position: "absolute", left: 0, top: 620, opacity: 0.4 }}>
            <DitherCover id="mac-wallpaper" size={1080} time={Math.floor(frame / 4) / 30} bare />
          </div>
          <div
            style={{
              position: "absolute",
              left: -200,
              top: ISLAND_TOP - 80,
              width: 1480,
              height: 900,
              background: glowOf(0.34 * ramp(frame, 2, 12), 40),
            }}
          />
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: ISLAND_TOP, background: "#000" }} />
        </Layer>
        <Layer z={0}>
          <div style={{ position: "absolute", left: (1080 - ISLAND_WIDTH) / 2, top: ISLAND_TOP }}>
            <Halation strength={0.12} radius={34}>
              <NotchIsland state={islandAt(frame)} width={ISLAND_WIDTH} />
            </Halation>
          </div>
        </Layer>
        <Bokeh focusZ={0} z={300} count={6} seed={5} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <CutChip text="lives in your notch" from={6} y={ISLAND_TOP + (ASSET.h * ISLAND_WIDTH) / ASSET.w + 60} />
    </>
  );
}

function LookView({ name }: { name: (typeof LOOKS)[number] }) {
  const frame = useCurrentFrame();
  return (
    <DitherReveal progress={ramp(frame, 0, REVEAL, ease.inOut)} tall>
      <PlateWindow
        src={filmPlate(`look-${name}/albums`)}
        box={{ x: 200, y: 55, w: 600, h: 755 }}
        x={90}
        y={300}
        width={900}
        filter={name === "paper" ? undefined : "brightness(1.5)"}
      />
    </DitherReveal>
  );
}

function Themes() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, KEYS_AT - THEMES_AT, { scale: { from: 1, to: 1.06 }, y: { from: 0, to: 20 } });
  return (
    <>
      <Camera cam={cam}>
        {LOOKS.map((name, i) => (
          <Sequence key={name} layout="none" from={LOOK_AT[i]}>
            <LookView name={name} />
          </Sequence>
        ))}
      </Camera>
      <CutChip text="themes" from={4} y={1470} />
    </>
  );
}

function Keys() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, SHOT.frames - KEYS_AT, { scale: { from: 1.02, to: 1.1 }, y: { from: 0, to: 30 }, ry: { from: 2, to: -2 } });
  return (
    <>
      <Camera cam={cam}>
        <Layer z={0}>
          <PlateWindow
            src={filmPlate("shortcuts-sheet/sheet")}
            box={{ x: 384, y: 60, w: 376, h: 380 }}
            x={90}
            y={300}
            width={900}
            filter="brightness(2.2)"
          />
        </Layer>
        <Bokeh focusZ={0} z={300} count={6} seed={13} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <Stamp labels={["?"]} at={KEY_STRIKE} y={1260} size={150} />
      <CutChip text="every shortcut" from={KEY_STRIKE + 2} y={1470} />
    </>
  );
}

/** Cut 5: three one-beat flashes, each one idea: the macOS notch opens on the lyric, the themes dither in, the shortcut sheet answers a key. */
export function FlashesScene() {
  return (
    <>
      <Sequence layout="none" durationInFrames={NOTCH_FRAMES}>
        <Notch />
      </Sequence>
      <Sequence layout="none" from={THEMES_AT} durationInFrames={KEYS_AT - THEMES_AT}>
        <Themes />
      </Sequence>
      <Sequence layout="none" from={KEYS_AT}>
        <Keys />
      </Sequence>
      <Hit at={0} strength={0.16} />
      <Hit at={THEMES_AT} strength={0.16} />
      <Hit at={KEYS_AT} strength={0.16} />
    </>
  );
}
