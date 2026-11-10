import type { ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, type Cam, Camera, type CamKey, camAt, handheld, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { Window } from "../ui/frames";
import { Chip } from "../ui/s7-chip";
import { filmPlate as film } from "../ui/s8-real-crop";
import { TerminalMock } from "../ui/s9-terminal-mock";
import { shotOf } from "./timelines";

const SHOT = shotOf("shells");
const g = (frame: number): number => frame / 30;
const LIFT = "brightness(1.6)";

const CUT_TERMINAL = SHOT.beat(3.5);

const TYPE_FROM = 6;
const TYPE_STEP = 2.2;
const COMMAND = "/lodesong pause";
const LANDINGS = [...COMMAND].map((_, i) => TYPE_FROM + Math.round(i * TYPE_STEP));
const ENTER = (LANDINGS.at(-1) ?? 0) + 8;

export const S9_CUES: readonly ShotCue[] = [
  { shot: "shells", at: 0, kind: "hit", label: "desktop app" },
  { shot: "shells", at: CUT_TERMINAL, kind: "hit", label: "your terminal" },
  ...LANDINGS.map((at): ShotCue => ({ shot: "shells", at: CUT_TERMINAL + at, kind: "typed", label: "command key" })),
  { shot: "shells", at: CUT_TERMINAL + ENTER, kind: "click", label: "pause" },
];

interface SceneProps {
  children: ReactNode;
  frames: number;
  chip: string;
  from?: Partial<Cam>;
  to?: Partial<Cam>;
  keys?: CamKey[];
  seed?: number;
}

/** One cut of the montage: starts 1.15x and settles toward 1.0 on the gold cover, with a pool of gold behind it and bokeh in front. */
function Scene({ children, frames, chip, from, to, keys, seed = 3 }: SceneProps) {
  const frame = useCurrentFrame();
  const cam = addCam(
    camAt(
      frame,
      keys ?? [
        { at: g(0), ...from },
        { at: g(frames), ...to },
      ],
    ),
    handheld(frame, 0.8),
  );
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-160}>
          <div
            style={{
              position: "absolute",
              left: 160,
              top: 20,
              width: 1600,
              height: 1040,
              background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 50%, transparent), transparent)",
              opacity: 1,
            }}
          />
        </Layer>
        <Layer z={0} style={{ filter: LIFT }}>
          {children}
        </Layer>
        <Bokeh focusZ={0} z={300} count={10} seed={seed} opacity={0.22} />
      </Camera>
      <Chip text={chip} from={0} style={{ left: 70, top: 950 }} />
    </>
  );
}

function Desktop({ frames }: { frames: number }) {
  return (
    <Scene frames={frames} chip="desktop app" from={{ scale: 1.1, ry: 4 }} to={{ scale: 1, ry: -2 }} seed={7}>
      <Window width={1620} height={965} title="lodesong — linux" style={{ left: 150, top: 50 }}>
        <Img src={film("home-mixes/home")} style={{ width: "100%", height: "100%" }} />
      </Window>
    </Scene>
  );
}

function Terminal({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const seconds = 74 + Math.min(frame, ENTER) / 60;
  return (
    <Scene
      frames={frames}
      chip="your terminal"
      keys={[
        { at: g(0), scale: 1.1, ry: -3, x: 0, y: 0 },
        { at: g(34), scale: 1, ry: 1, x: 0, y: 0 },
        { at: g(frames - 4), scale: 1.12, ry: 0, x: 0, y: 60 },
      ]}
      seed={11}
    >
      <Window width={1680} height={640} title="your terminal" style={{ left: 120, top: 210, background: "#232323" }}>
        <TerminalMock frame={frame} landings={LANDINGS} enter={ENTER} seconds={seconds} />
      </Window>
    </Scene>
  );
}

/** S9: the desktop app in one big window, then a terminal pausing the song. */
export function ShellsShot() {
  return (
    <>
      <Sequence layout="none" from={0} durationInFrames={CUT_TERMINAL}>
        <Desktop frames={CUT_TERMINAL} />
      </Sequence>
      <Sequence layout="none" from={CUT_TERMINAL} durationInFrames={SHOT.frames - CUT_TERMINAL}>
        <Terminal frames={SHOT.frames - CUT_TERMINAL} />
      </Sequence>
    </>
  );
}
