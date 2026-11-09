import type { ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, type Cam, Camera, type CamKey, camAt, handheld, Layer } from "../design/camera";
import { DeviceFrame } from "../design/device-frame";
import { Bokeh } from "../design/dof";
import { Halation } from "../design/halation";
import { Window } from "../ui/frames";
import { Chip } from "../ui/s7-chip";
import { filmPlate as film } from "../ui/s8-real-crop";
import { TerminalMock } from "../ui/s9-terminal-mock";
import { shotOf } from "./timelines";

const SHOT = shotOf("shells");
const g = (frame: number): number => frame / 30;
const LIFT = "brightness(1.35)";

const CUT_ANDROID = SHOT.beat(2);
const CUT_DESKTOP = SHOT.beat(4);
const CUT_TERMINAL = SHOT.beat(5.5);

const TYPE_FROM = 6;
const TYPE_STEP = 2.2;
const COMMAND = "/lodesong pause";
const LANDINGS = [...COMMAND].map((_, i) => TYPE_FROM + Math.round(i * TYPE_STEP));
const ENTER = (LANDINGS.at(-1) ?? 0) + 8;

export const S9_CUES: readonly ShotCue[] = [
  { shot: "shells", at: 0, kind: "hit", label: "iphone" },
  { shot: "shells", at: CUT_ANDROID, kind: "hit", label: "android" },
  { shot: "shells", at: CUT_DESKTOP, kind: "hit", label: "linux and windows" },
  { shot: "shells", at: CUT_TERMINAL, kind: "hit", label: "claude code" },
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
              left: 300,
              top: 60,
              width: 1320,
              height: 960,
              background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 34%, transparent), transparent)",
              opacity: 0.85,
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

interface PhoneSceneProps {
  frames: number;
  kind: "iphone" | "android";
  src: string;
  chip: string;
  ry: number;
  left: number;
  seed: number;
}

function PhoneScene({ frames, kind, src, chip, ry, left, seed }: PhoneSceneProps) {
  return (
    <Scene frames={frames} chip={chip} from={{ scale: 1.15, ry }} to={{ scale: 1, ry: ry * -0.35 }} seed={seed}>
      <Halation fill strength={0.1} radius={40}>
        <DeviceFrame kind={kind} width={700} note={false} src={film(src)} style={{ left, top: 50 }} />
      </Halation>
    </Scene>
  );
}

function PhonePair({ frames }: { frames: number }) {
  return (
    <Scene frames={frames} chip="android app" from={{ scale: 1.15, ry: 9 }} to={{ scale: 1, ry: -3 }} seed={6}>
      <Halation fill strength={0.1} radius={40}>
        <DeviceFrame kind="android" width={470} note={false} src={film("phone-home/home")} style={{ left: 430, top: 70 }} />
      </Halation>
      <Layer z={90}>
        <Halation fill strength={0.1} radius={40}>
          <DeviceFrame kind="android" width={470} note={false} src={film("phone-player/queue")} style={{ left: 990, top: 24 }} />
        </Halation>
      </Layer>
    </Scene>
  );
}

function Desktop({ frames }: { frames: number }) {
  return (
    <Scene frames={frames} chip="linux  windows" from={{ scale: 1.15, ry: 5 }} to={{ scale: 1, ry: -2 }} seed={7}>
      <Layer z={-90} style={{ filter: "brightness(0.8)" }}>
        <Window width={1100} height={671} title="lodesong — windows" style={{ left: 700, top: 10 }}>
          <Img src={film("stats/stats")} style={{ width: "100%", height: "100%" }} />
        </Window>
      </Layer>
      <Window width={1300} height={783} title="lodesong — linux" style={{ left: 110, top: 120 }}>
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
      chip="claude code"
      keys={[
        { at: g(0), scale: 1.1, ry: -3, x: 0, y: 0 },
        { at: g(34), scale: 1, ry: 1, x: 0, y: 0 },
        { at: g(frames - 4), scale: 1.12, ry: 0, x: 0, y: 60 },
      ]}
      seed={11}
    >
      <Window width={1500} height={560} title="claude code" style={{ left: 210, top: 250, background: "#0a0a0a" }}>
        <TerminalMock frame={frame} landings={LANDINGS} enter={ENTER} seconds={seconds} />
      </Window>
    </Scene>
  );
}

/** S9: one gold cover, four surfaces, a hard cut every two and a half beats: an iphone on lyrics, two androids on albums and the queue, the linux and windows shells, then Claude Code pausing the song. */
export function ShellsShot() {
  return (
    <>
      <Sequence layout="none" from={0} durationInFrames={CUT_ANDROID}>
        <PhoneScene frames={CUT_ANDROID} kind="iphone" src="phone-lyrics/lyrics" chip="iphone app" ry={-9} left={610} seed={4} />
      </Sequence>
      <Sequence layout="none" from={CUT_ANDROID} durationInFrames={CUT_DESKTOP - CUT_ANDROID}>
        <PhonePair frames={CUT_DESKTOP - CUT_ANDROID} />
      </Sequence>
      <Sequence layout="none" from={CUT_DESKTOP} durationInFrames={CUT_TERMINAL - CUT_DESKTOP}>
        <Desktop frames={CUT_TERMINAL - CUT_DESKTOP} />
      </Sequence>
      <Sequence layout="none" from={CUT_TERMINAL} durationInFrames={SHOT.frames - CUT_TERMINAL}>
        <Terminal frames={SHOT.frames - CUT_TERMINAL} />
      </Sequence>
    </>
  );
}
