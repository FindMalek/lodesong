import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SHEET } from "../audio-cues";
import { clock, FILM, FIXTURE } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { gold } from "../design/gold";
import { ease, ramp } from "../design/motion";
import { useSongSeconds } from "../design/song-clock";
import { Caret, typedCount } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { Window } from "../ui/frames";
import { GoldTransit } from "../ui/gold-transit";
import { HERO_SHOTS, starts, TERMINAL } from "./timelines";

const COMMAND = FILM.terminal.command;
const SHOT_START = starts(HERO_SHOTS).terminal ?? 0;
const STRUCK = SHEET.filter((cue) => cue.film === "hero" && cue.style === "typed").map((cue) => cue.frame - SHOT_START);
const LANDINGS = [...COMMAND].map((_, i) => STRUCK[i] ?? (STRUCK.at(-1) ?? 0) + 5 * (i - STRUCK.length + 1));
const ENTER = beat(TERMINAL.enter);
const COMMAND_AGAIN = "/lodesong pause";
const AGAIN_LANDINGS = [...COMMAND_AGAIN].map((_, i) => beat(TERMINAL.again) + 3 * i);
const PAUSE = beat(TERMINAL.pause);
const PHONE_END = { cx: 1650, cy: 340, size: 330 };
const MONO = "var(--font-mono)";

interface Now {
  track: string;
  artist: string;
  line: string;
  at: number;
}
const TRACK_SECONDS = [FIXTURE.tracks[0][1], FIXTURE.tracks[1][1]] as const;

const G = {
  win: { x: 190, y: 390, w: 1540, h: 610 },
  cover: 128,
  font: 40,
  pad: 44,
  bar: 640,
  caption: { left: 190, top: 90, font: 120 },
} as const;

function Swap({ frame, height, a, b }: { frame: number; height: number; a: ReactNode; b: ReactNode }) {
  const t = ramp(frame, ENTER, beat(0.5));
  return (
    <div style={{ position: "relative", height, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${-t * 110}%)` }}>{a}</div>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - t) * 110}%)` }}>{b}</div>
    </div>
  );
}

export function TerminalShot() {
  const frame = useCurrentFrame();
  const g = G;
  const time = frame / FPS;
  const typedFirst = COMMAND.slice(0, typedCount(frame, LANDINGS));
  const typedAgain = COMMAND_AGAIN.slice(0, typedCount(frame, AGAIN_LANDINGS));
  const typed = frame < ENTER ? typedFirst : frame < PAUSE ? typedAgain : "";
  const typing = frame < ENTER ? typedFirst.length < COMMAND.length : frame < PAUSE && typedAgain.length < COMMAND_AGAIN.length;
  const paused = frame >= PAUSE;
  const dim = 1 - 0.3 * ramp(frame, PAUSE, beat(0.5));
  const arrival = ramp(frame, 0, beat(1.25), ease.inOut);
  const [one, two]: readonly Now[] = FILM.terminal.now;
  const sinceEnter = Math.max(0, (Math.min(frame, PAUSE) - ENTER) / FPS);
  const stage = frame >= ENTER ? 1 : 0;
  const playhead = useSongSeconds();
  const position = stage === 0 ? playhead : (two?.at ?? 0) + sinceEnter;
  const length = TRACK_SECONDS[stage];
  const flash = ramp(frame, ENTER, beat(0.125)) - ramp(frame, ENTER + beat(0.25), beat(0.25));
  const flashPause = ramp(frame, PAUSE, beat(0.125)) - ramp(frame, PAUSE + beat(0.25), beat(0.25));
  const open = ramp(frame, 0, beat(0.5));
  const cam = camAt(frame, [
    { at: 0, scale: 1.0, ry: -3, x: -10 },
    { at: TERMINAL.end, scale: 1.03, ry: 2, x: 10 },
  ]);
  const row = (now: Now, id: string, develop: number, rowOpacity = 1, coverOpacity = 1) => (
    <div style={{ position: "absolute", inset: 0, display: "flex", gap: 28, opacity: rowOpacity }}>
      <div style={{ width: g.cover, height: g.cover, flexShrink: 0, opacity: coverOpacity }}>
        <DitherCover id={id} size={g.cover} develop={develop} time={time * 0.5} color={gold(1)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div data-legible="" style={{ fontSize: g.font, fontWeight: 500, whiteSpace: "nowrap" }}>
          {now.track}
        </div>
        <div style={{ fontSize: g.font - 6, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{now.artist}</div>
      </div>
    </div>
  );
  const lyric = (text: string) => (
    <div data-legible="" style={{ position: "absolute", inset: 0, fontSize: g.font, whiteSpace: "nowrap" }}>
      “{text}”
    </div>
  );
  const icons = [SkipBackIcon, paused ? PlayIcon : PauseIcon, SkipForwardIcon] as const;
  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Layer z={-300}>
          <AbsoluteFill style={{ opacity: 0.08, maskImage: "radial-gradient(circle at 50% 60%, black 0, transparent 640px)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
              <DitherCover id="terminal-field" size={1080} time={time * 0.5} />
            </div>
          </AbsoluteFill>
        </Layer>
        <Layer z={0}>
          <Caption
            lines={FILM.terminal.caption}
            from={beat(TERMINAL.caption)}
            font={g.caption.font}
            style={{ left: g.caption.left, top: g.caption.top }}
          />
        </Layer>
        <Layer z={20}>
          <GoldTransit
            from={PHONE_END}
            to={{ cx: g.win.x + g.pad + g.cover / 2, cy: g.win.y + 52 + g.pad + g.cover / 2, size: g.cover }}
            progress={arrival}
            time={time}
          />
        </Layer>
        <Layer z={0}>
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 ${(1 - open) * 100}% 0)` }}>
            <Window width={g.win.w} height={g.win.h} title="claude" style={{ left: g.win.x, top: g.win.y, background: "#050505" }}>
              <div style={{ position: "absolute", left: g.pad, top: g.pad, right: g.pad, fontFamily: MONO, fontSize: g.font }}>
                <Swap
                  frame={frame}
                  height={g.cover}
                  a={row(one ?? FILM.terminal.now[0], "quiet-hours-ii", 1, 1, arrival >= 1 ? 1 : 0)}
                  b={row(two ?? FILM.terminal.now[1], "static-echo-at-night", ramp(frame, ENTER + beat(0.25), beat(1.5), ease.inOut), dim)}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 22,
                    marginTop: 34,
                    fontSize: g.font - 6,
                    color: "var(--muted-foreground)",
                  }}
                >
                  <span>{clock(position)}</span>
                  <div style={{ position: "relative", width: g.bar, height: 4, background: "var(--border)" }}>
                    <div
                      style={{
                        position: "absolute",
                        inset: "0 auto 0 0",
                        width: `${(position / length) * 100}%`,
                        background: "var(--foreground)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: -8,
                        left: `calc(${(position / length) * 100}% - 10px)`,
                        width: 20,
                        height: 20,
                        background: "var(--foreground)",
                      }}
                    />
                  </div>
                  <span>{clock(length)}</span>
                  {
                    <div style={{ display: "flex", gap: 16, marginLeft: "auto", color: "var(--foreground)" }}>
                      {icons.map((Icon, index) => {
                        const hit = index === 2 ? flash : index === 1 ? flashPause : 0;
                        return (
                          <div
                            key={String(index)}
                            style={{
                              width: 72,
                              height: 72,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                              background: hit > 0.5 ? "var(--foreground)" : "transparent",
                              color: hit > 0.5 ? "var(--background)" : "var(--foreground)",
                            }}
                          >
                            <Icon size={36} />
                          </div>
                        );
                      })}
                    </div>
                  }
                </div>
                <div style={{ marginTop: 26 }}>
                  <Swap frame={frame} height={g.font * 1.4} a={lyric(one?.line ?? "")} b={lyric(two?.line ?? "")} />
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: g.pad,
                  right: g.pad,
                  bottom: g.pad,
                  height: 104,
                  border: "1px solid color-mix(in oklch, var(--foreground) 35%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 28px",
                  gap: 22,
                  fontFamily: MONO,
                  fontSize: g.font,
                }}
              >
                <span style={{ color: "var(--muted-foreground)" }}>&gt;</span>
                <span data-legible="">
                  {typed}
                  <Caret frame={frame} typing={typing} size={g.font} />
                </span>
              </div>
            </Window>
          </div>
        </Layer>
      </Camera>
      <DitherWipe />
    </AbsoluteFill>
  );
}
