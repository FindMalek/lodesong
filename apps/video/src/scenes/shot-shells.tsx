import type { ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { clock } from "../copy";
import { addCam, type Cam, Camera, type CamKey, camAt, handheld, Layer } from "../design/camera";
import { DeviceFrame } from "../design/device-frame";
import { Bokeh } from "../design/dof";
import { Halation } from "../design/halation";
import { ease, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { Window } from "../ui/frames";
import { Chip } from "../ui/s7-chip";
import { filmPlate as film } from "../ui/s8-real-crop";
import { NotchIsland } from "../ui/s9-notch-island";
import { TerminalMock } from "../ui/s9-terminal-mock";
import { shotOf } from "./timelines";

const SHOT = shotOf("shells");
const g = (frame: number): number => frame / 30;

const CUT_NOTCH = 0;
const CUT_IOS = SHOT.beat(2);
const CUT_ANDROID = SHOT.beat(4);
const CUT_DESKTOP = SHOT.beat(6);
const CUT_TERMINAL = SHOT.beat(8);
const NOTCH_OPEN = 10;

const FIRST_TYPED = 4;
const SECOND_TYPED = 46;
const TYPE_STEP = 2.2;
const landings = (from: number, text: string): number[] => [...text].map((_, i) => from + Math.round(i * TYPE_STEP));
const FIRST = landings(FIRST_TYPED, "/lodesong next");
const SECOND = landings(SECOND_TYPED, "/lodesong pause");
const ENTER_FIRST = (FIRST.at(-1) ?? 0) + 8;
const ENTER_SECOND = (SECOND.at(-1) ?? 0) + 8;

export const S9_CUES: readonly ShotCue[] = [
  { shot: "shells", at: CUT_NOTCH, kind: "hit", label: "mac notch" },
  { shot: "shells", at: NOTCH_OPEN, kind: "swell", label: "island opens" },
  { shot: "shells", at: CUT_IOS, kind: "hit", label: "iphone" },
  { shot: "shells", at: CUT_ANDROID, kind: "hit", label: "android" },
  { shot: "shells", at: CUT_DESKTOP, kind: "hit", label: "linux and windows" },
  { shot: "shells", at: CUT_TERMINAL, kind: "hit", label: "claude code" },
  ...FIRST.map((at): ShotCue => ({ shot: "shells", at: CUT_TERMINAL + at, kind: "typed", label: "command key" })),
  { shot: "shells", at: CUT_TERMINAL + ENTER_FIRST, kind: "click", label: "next" },
  ...SECOND.map((at): ShotCue => ({ shot: "shells", at: CUT_TERMINAL + at, kind: "typed", label: "command key" })),
  { shot: "shells", at: CUT_TERMINAL + ENTER_SECOND, kind: "click", label: "pause" },
];

interface SceneProps {
  children: ReactNode;
  frames: number;
  chip: string;
  note?: string;
  from?: Partial<Cam>;
  to?: Partial<Cam>;
  keys?: CamKey[];
  glow?: boolean;
  seed?: number;
}

/** One cut of the montage: starts 1.15x and settles toward 1.0 on the gold cover, with a pool of gold behind it and bokeh in front. */
function Scene({ children, frames, chip, note, from, to, keys, glow = true, seed = 3 }: SceneProps) {
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
        {glow ? (
          <Layer z={-160}>
            <div
              style={{
                position: "absolute",
                left: 360,
                top: 90,
                width: 1200,
                height: 900,
                background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 26%, transparent), transparent)",
                opacity: 0.8,
              }}
            />
          </Layer>
        ) : null}
        <Layer z={0}>{children}</Layer>
        <Bokeh focusZ={0} z={300} count={10} seed={seed} opacity={0.22} />
      </Camera>
      <Chip text={chip} from={6} style={{ left: 70, top: 950 }} />
      {note ? (
        <div
          data-legible=""
          style={{
            position: "absolute",
            left: 70,
            top: 1010,
            fontFamily: "var(--font-mono)",
            fontSize: 28,
            color: "var(--muted-foreground)",
            opacity: ramp(frame, 12, 12),
          }}
        >
          {note}
        </div>
      ) : null}
    </>
  );
}

function Notch({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const open = ramp(frame, NOTCH_OPEN, 20, ease.out);
  const played = 74 + frame / 60;
  const width = 1700;
  return (
    <Scene
      frames={frames}
      chip="macos"
      note="real island capture, our cover and title"
      from={{ scale: 1, ry: -2, x: 0 }}
      to={{ scale: 1.07, ry: 2, x: 0 }}
      glow={false}
      seed={5}
    >
      <div style={{ position: "absolute", left: -120, top: -80, width: 2160, height: 1240, overflow: "hidden", background: "#050505" }}>
        <div
          style={{
            position: "absolute",
            left: 540,
            top: 80,
            transform: "scale(1.8)",
            transformOrigin: "540px 540px",
            opacity: 0.9,
            maskImage: "radial-gradient(circle at 50% 40%, #000 20%, transparent 64%)",
          }}
        >
          <DitherCover id="mac-wallpaper" size={1080} time={frame / 120} bare color="var(--foreground)" opacity={0.4} />
        </div>
      </div>
      <div style={{ position: "absolute", left: (1920 - width) / 2, top: 0 }}>
        <Halation strength={0.12} radius={30}>
          <NotchIsland
            open={open}
            width={width}
            title="signal violet pt. 2"
            artist="satellite garden — quiet hours ii"
            played={clock(played)}
            left={`-${clock(222 - played)}`}
            progress={played / 222}
          />
        </Halation>
      </div>
    </Scene>
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

function Desktop({ frames }: { frames: number }) {
  return (
    <Scene
      frames={frames}
      chip="linux  windows"
      note="tauri shells, window frames are art"
      from={{ scale: 1.15, ry: 5 }}
      to={{ scale: 1, ry: -2 }}
      seed={7}
    >
      <Layer z={-90} style={{ filter: "brightness(0.65)" }}>
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
  const position = frame < ENTER_FIRST ? 74 + frame / 60 : 3 + (Math.min(frame, ENTER_SECOND) - ENTER_FIRST) / 60;
  return (
    <Scene
      frames={frames}
      chip="claude code"
      note="terminal is a mock, a shell cannot be captured"
      keys={[
        { at: g(0), scale: 1.1, ry: -3, x: 0, y: 0 },
        { at: g(34), scale: 1, ry: 1, x: 0, y: 0 },
        { at: g(frames - 4), scale: 1.28, ry: 0, x: 0, y: 170 },
      ]}
      seed={11}
    >
      <Window width={1500} height={560} title="claude code" style={{ left: 210, top: 250, background: "#050505" }}>
        <TerminalMock frame={frame} first={FIRST} second={SECOND} enterFirst={ENTER_FIRST} enterSecond={ENTER_SECOND} position={position} />
      </Window>
    </Scene>
  );
}

/** S9: one gold cover, five surfaces, a hard cut every two beats: the mac notch, an iphone, an android, the linux and windows shells, then Claude Code in a terminal. */
export function ShellsShot() {
  return (
    <>
      <Sequence layout="none" from={CUT_NOTCH} durationInFrames={CUT_IOS - CUT_NOTCH}>
        <Notch frames={CUT_IOS - CUT_NOTCH} />
      </Sequence>
      <Sequence layout="none" from={CUT_IOS} durationInFrames={CUT_ANDROID - CUT_IOS}>
        <PhoneScene frames={CUT_ANDROID - CUT_IOS} kind="iphone" src="phone-lyrics/lyrics" chip="iphone app" ry={-9} left={610} seed={4} />
      </Sequence>
      <Sequence layout="none" from={CUT_ANDROID} durationInFrames={CUT_DESKTOP - CUT_ANDROID}>
        <PhoneScene
          frames={CUT_DESKTOP - CUT_ANDROID}
          kind="android"
          src="phone-player/album"
          chip="android app"
          ry={9}
          left={610}
          seed={6}
        />
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
