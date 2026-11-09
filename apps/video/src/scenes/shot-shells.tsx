import type { ReactNode } from "react";
import { Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, type Cam, Camera, camAt, camTo, handheld, Layer } from "../design/camera";
import { DeviceFrame } from "../design/device-frame";
import { Bokeh } from "../design/dof";
import { Halation } from "../design/halation";
import { ease, lerp, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { Window } from "../ui/frames";
import { Chip } from "../ui/s7-chip";
import { NotchIsland } from "../ui/s9-notch-island";
import { TerminalMock } from "../ui/s9-terminal-mock";
import { shotOf } from "./timelines";

const SHOT = shotOf("shells");
const g = (frame: number): number => frame / 30;
const film = (name: string): string => staticFile(`film/${name}.png`);

const CUT_NOTCH = 0;
const CUT_IOS = SHOT.beat(2);
const CUT_ANDROID = SHOT.beat(4);
const CUT_DESKTOP = SHOT.beat(6);
const CUT_TERMINAL = SHOT.beat(8);
const NOTCH_OPEN = 14;

const FIRST_TYPED = 6;
const SECOND_TYPED = 56;
const TYPE_STEP = 2.4;
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
  from: Partial<Cam>;
  to: Partial<Cam>;
  glow?: boolean;
  seed?: number;
}

/** One cut of the montage: starts 1.15x and settles toward 1.0 on the gold cover, with a pool of gold behind it and bokeh in front. */
function Scene({ children, frames, chip, note, from, to, glow = true, seed = 3 }: SceneProps) {
  const frame = useCurrentFrame();
  const cam = addCam(
    camAt(frame, [
      { at: g(0), ...from },
      { at: g(frames), ...to },
    ]),
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

const MENU_BAR = 44;

function Notch({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const open = ramp(frame, NOTCH_OPEN, 20, ease.out);
  const drop = ramp(frame, 0, 8, ease.out);
  const played = 74 + frame / 60;
  const width = 1500;
  return (
    <Scene
      frames={frames}
      chip="macos"
      note="real island capture, our cover and title"
      from={{ scale: 1.15, ry: -3, x: 0 }}
      to={{ scale: 1, ry: 2, x: 0 }}
      glow={false}
      seed={5}
    >
      <div style={{ position: "absolute", left: -120, top: -80, width: 2160, height: 1240, overflow: "hidden", background: "#050505" }}>
        <div style={{ position: "absolute", left: 540, top: 140, opacity: 0.5 }}>
          <DitherCover
            id="mac-wallpaper"
            size={1080}
            time={frame / 120}
            bare
            color="color-mix(in oklch, var(--foreground) 55%, transparent)"
            opacity={0.55}
          />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: MENU_BAR, background: "#000" }} />
      <div style={{ position: "absolute", left: (1920 - width) / 2, top: lerp(-120, 0, drop) }}>
        <Halation strength={0.12} radius={30}>
          <NotchIsland
            open={open}
            width={width}
            title="signal violet pt. 2"
            artist="satellite garden — quiet hours ii"
            played={`1:${String(Math.floor(played - 60)).padStart(2, "0")}`}
            left={`-2:${String(Math.max(0, Math.floor(222 - played))).padStart(2, "0")}`}
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
        <Window width={1100} height={671} title="lodesong — windows" style={{ left: 700, top: 30 }}>
          <Img src={film("stats/stats")} style={{ width: "100%", height: "100%" }} />
        </Window>
      </Layer>
      <Window width={1300} height={783} title="lodesong — linux" style={{ left: 110, top: 170 }}>
        <Img src={film("home-mixes/home")} style={{ width: "100%", height: "100%" }} />
      </Window>
    </Scene>
  );
}

function Terminal({ frames }: { frames: number }) {
  const frame = useCurrentFrame();
  const position = 74 + (Math.min(frame, ENTER_SECOND) / 60) * 1;
  const push = camTo({ x: 210, y: 560, w: 1500, h: 300 }, { scale: 1.55, ry: 0 });
  return (
    <Scene
      frames={frames}
      chip="claude code"
      note="terminal is a mock, a shell cannot be captured"
      from={{ scale: 1.12, ry: -3 }}
      to={push}
      seed={11}
    >
      <Window width={1500} height={700} title="claude code" style={{ left: 210, top: 190, background: "#050505" }}>
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
