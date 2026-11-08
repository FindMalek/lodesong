import { Kbd } from "@lodesong/ui/components/kbd";
import { Audio } from "@remotion/media";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FontGate } from "../design/fonts";
import { Grain, Vignette } from "../design/grain";
import { Label, MaskLine } from "../design/kinetic";
import { beat, ease, FPS, hash, lerp, ramp } from "../design/motion";
import { DitherCover } from "../ui/dither-cover";
import { Lyrics, Main, PlayerBar, Sidebar, STAGE } from "../ui/player-panels";

export const OPEN_FRAMES = beat(12);

const VOID = "color-mix(in oklch, var(--background), black 55%)";
const ASSEMBLE = beat(4);
const KEY = beat(5.5);
const LYRICS_IN = KEY + 8;

function timecode(frame: number): string {
  const s = Math.floor(frame / FPS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `00:00:${pad(s)}:${pad(frame % FPS)}`;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface Fly {
  x: number;
  y: number;
  z: number;
  from: number;
  duration?: number;
}

function fly(frame: number, spec: Fly) {
  const t = ramp(frame, spec.from, spec.duration ?? 54);
  return {
    opacity: ramp(frame, spec.from, 18, ease.out),
    transform: `translate3d(${lerp(spec.x, 0, t)}px, ${lerp(spec.y, 0, t)}px, ${lerp(spec.z, 0, t)}px)`,
  };
}

function Marks() {
  const edge = 56;
  const arm = 28;
  const line = { position: "absolute", background: "var(--muted-foreground)", opacity: 0.6 } as const;
  return (
    <>
      {[0, 1, 2, 3].map((corner) => {
        const left = corner % 2 === 0;
        const top = corner < 2;
        const h = { ...line, width: arm, height: 1, [left ? "left" : "right"]: edge, [top ? "top" : "bottom"]: edge } as const;
        const v = { ...line, width: 1, height: arm, [left ? "left" : "right"]: edge, [top ? "top" : "bottom"]: edge } as const;
        return (
          <div key={corner}>
            <div style={h} />
            <div style={v} />
          </div>
        );
      })}
    </>
  );
}

export function Open() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const unit = Math.min(width / 1920, height / 1080);
  const time = frame / FPS;

  const uiT = ramp(frame, ASSEMBLE, 40);
  const push = ramp(frame, beat(5), OPEN_FRAMES - beat(5), ease.inOut);
  const scale = unit * lerp(1.0, 1.1, push);
  const rotateY = lerp(-7, -4, push);
  const rotateX = lerp(5, 2, push);
  const driftX = 0;

  const focus = 3 + ramp(frame, beat(7), 20) + ramp(frame, beat(9), 20) - 1;
  const dim = ramp(frame, beat(8), 40, ease.inOut);
  const lift = dim * 110;
  const lyricsFly = fly(frame, { x: 340, y: 0, z: -300, from: LYRICS_IN, duration: 40 });
  const position = 1 + Math.max(0, frame - ASSEMBLE) / FPS;
  const bars = [0, 1, 2, 3].map((i) => 0.25 + 0.75 * hash(Math.floor(frame / 5) + i * 13));
  const develop = ramp(frame, ASSEMBLE + 4, 80, ease.inOut);

  const keyPress = ramp(frame, KEY, 4) - ramp(frame, KEY + 6, 6);
  const keyShow = ramp(frame, KEY - 12, 12) * (1 - ramp(frame, KEY + 40, 14, ease.in));

  const lineT = ramp(frame, 0, 36, ease.inOut);

  return (
    <FontGate>
      <AbsoluteFill className="dark" style={{ background: VOID, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
        <AbsoluteFill
          style={{ opacity: 0.16 * (1 - uiT * 0.7), maskImage: "radial-gradient(circle at 50% 50%, black 0, transparent 540px)" }}
        >
          <div style={{ position: "absolute", left: (width - 1080) / 2, top: 0 }}>
            <DitherCover id="lodesong-open" size={1080} time={time * 0.6} />
          </div>
        </AbsoluteFill>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 1,
            background: "var(--border)",
            transform: `scaleX(${lineT})`,
            opacity: 1 - uiT,
          }}
        />

        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 168 * unit, color: "var(--foreground)" }}>
          <div style={{ fontSize: 176 * unit, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
            <MaskLine from={beat(1)} out={ASSEMBLE - 4}>
              your music.
            </MaskLine>
            <MaskLine from={beat(2)} out={ASSEMBLE} style={{ color: "var(--muted-foreground)" }}>
              your server.
            </MaskLine>
          </div>
          <div
            style={{
              position: "absolute",
              left: 168 * unit,
              bottom: 150 * unit,
              opacity: ramp(frame, beat(3), 20) * (1 - ramp(frame, ASSEMBLE - 8, 12, ease.in)),
            }}
          >
            <Label>self-hosted music player</Label>
          </div>
        </AbsoluteFill>

        <AbsoluteFill style={{ perspective: 2200, alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              position: "relative",
              width: STAGE.width,
              height: STAGE.height,
              transformStyle: "preserve-3d",
              transform: `translate(${driftX}px, 0px) scale(${scale}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
              boxShadow: uiT > 0 ? "0 0 0 1px var(--border), 0 60px 160px rgb(0 0 0 / 0.7), 0 0 240px rgb(255 255 255 / 0.05)" : "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transformStyle: "preserve-3d",
                ...fly(frame, { x: 0, y: 70, z: -500, from: ASSEMBLE }),
                opacity: ramp(frame, ASSEMBLE, 18) * (1 - 0.5 * dim),
              }}
            >
              <Main develop={develop} time={time * 0.5} bars={bars} />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transformStyle: "preserve-3d",
                ...fly(frame, { x: -300, y: 0, z: -260, from: ASSEMBLE + 8 }),
                opacity: ramp(frame, ASSEMBLE + 8, 18) * (1 - 0.5 * dim),
              }}
            >
              <Sidebar />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transformStyle: "preserve-3d",
                ...fly(frame, { x: 0, y: 240, z: -160, from: ASSEMBLE + 16 }),
                opacity: ramp(frame, ASSEMBLE + 16, 18) * (1 - 0.5 * dim),
              }}
            >
              <PlayerBar progress={Math.min(1, position / 20)} clock={clock(position)} />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                transformStyle: "preserve-3d",
                ...lyricsFly,
                transform: `${lyricsFly.transform} translateZ(${lift}px)`,
              }}
            >
              <Lyrics focus={focus} />
            </div>
          </div>
        </AbsoluteFill>

        <div
          style={{
            position: "absolute",
            left: 168 * unit,
            bottom: 44 * unit,
            transform: `translateY(${(1 - keyShow) * 16}px)`,
            opacity: keyShow,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: 14,
            background: VOID,
            border: "1px solid var(--border)",
          }}
        >
          <Kbd
            style={{
              width: 56,
              height: 56,
              fontSize: 28,
              background: "var(--foreground)",
              color: "var(--background)",
              transform: `translateY(${keyPress * 4}px)`,
            }}
          >
            y
          </Kbd>
          <Label style={{ color: "var(--foreground)" }}>synced lyrics</Label>
        </div>

        <Vignette />
        <Marks />
        <div style={{ position: "absolute", right: 56 + 44, top: 56 - 10, opacity: 0.8 }}>
          <Label style={{ fontSize: 20 }}>{timecode(frame)}</Label>
        </div>
        <Grain />
        <Audio src={staticFile("audio/open.wav")} />
      </AbsoluteFill>
    </FontGate>
  );
}
