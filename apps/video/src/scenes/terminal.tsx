import { PauseIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clock, FILM, FIXTURE } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { gold } from "../design/gold";
import { useLayout } from "../design/layout";
import { ease, ramp } from "../design/motion";
import { Caret, typedCount, typingFrames } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { Window } from "../ui/frames";
import { TERMINAL } from "./timelines";

const COMMAND = FILM.terminal.command;
const LANDINGS = typingFrames(COMMAND, beat(TERMINAL.type), 5);
const ENTER = beat(TERMINAL.enter);
const MONO = "var(--font-mono)";

interface Now {
  track: string;
  artist: string;
  line: string;
  at: number;
}
const TRACK_SECONDS = [FIXTURE.tracks[0][1], FIXTURE.tracks[1][1]] as const;

const GEOM = {
  wide: { win: { x: 168, y: 420, w: 1584, h: 560 }, cover: 112, font: 36, pad: 40, bar: 640, caption: { left: 168, top: 100, font: 120 } },
  tall: { win: { x: 90, y: 560, w: 900, h: 760 }, cover: 120, font: 34, pad: 32, bar: 520, caption: { left: 90, top: 270, font: 120 } },
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
  const { layout } = useLayout();
  const g = GEOM[layout];
  const tall = layout === "tall";
  const time = frame / FPS;
  const typed = frame < ENTER ? COMMAND.slice(0, typedCount(frame, LANDINGS)) : "";
  const [one, two]: readonly Now[] = FILM.terminal.now;
  const sinceEnter = Math.max(0, (frame - ENTER) / FPS);
  const stage = frame >= ENTER ? 1 : 0;
  const position = stage === 0 ? (one?.at ?? 0) + time : (two?.at ?? 0) + sinceEnter;
  const length = TRACK_SECONDS[stage];
  const flash = ramp(frame, ENTER, beat(0.125)) - ramp(frame, ENTER + beat(0.25), beat(0.25));
  const open = ramp(frame, 0, beat(1));
  const cam = camAt(
    frame,
    tall
      ? [
          { at: 0, scale: 1.0, y: 20 },
          { at: TERMINAL.end, scale: 1.04, y: -10 },
        ]
      : [
          { at: 0, scale: 1.0, ry: -3, x: -20 },
          { at: TERMINAL.end, scale: 1.06, ry: 2, x: 20 },
        ],
  );
  const row = (now: Now, id: string, develop: number) => (
    <div style={{ position: "absolute", inset: 0, display: "flex", gap: 28 }}>
      <div style={{ width: g.cover, height: g.cover, flexShrink: 0 }}>
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
  const icons = [SkipBackIcon, PauseIcon, SkipForwardIcon] as const;
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
        <Layer z={80}>
          <Caption lines={FILM.terminal.caption} from={beat(TERMINAL.caption)} font={g.caption.font} style={{ left: g.caption.left, top: g.caption.top }} />
        </Layer>
        <Layer z={0}>
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 ${(1 - open) * 100}% 0)` }}>
            <Window width={g.win.w} height={g.win.h} title="claude" style={{ left: g.win.x, top: g.win.y, background: "#050505" }}>
              <div style={{ position: "absolute", left: g.pad, top: g.pad, right: g.pad, fontFamily: MONO, fontSize: g.font }}>
                <Swap
                  frame={frame}
                  height={g.cover}
                  a={row(one ?? FILM.terminal.now[0], "quiet-hours-ii", 1)}
                  b={row(two ?? FILM.terminal.now[1], "static-echo-at-night", ramp(frame, ENTER + beat(0.25), beat(1.5), ease.inOut))}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34, fontSize: g.font - 6, color: "var(--muted-foreground)" }}>
                  <span>{clock(position)}</span>
                  <div style={{ position: "relative", width: g.bar, height: 4, background: "var(--border)" }}>
                    <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${(position / length) * 100}%`, background: "var(--foreground)" }} />
                    <div style={{ position: "absolute", top: -8, left: `calc(${(position / length) * 100}% - 10px)`, width: 20, height: 20, background: "var(--foreground)" }} />
                  </div>
                  <span>{clock(length)}</span>
                  {tall ? null : (
                    <div style={{ display: "flex", gap: 16, marginLeft: "auto", color: "var(--foreground)" }}>
                      {icons.map((Icon, index) => {
                        const hit = index === 2 ? flash : 0;
                        return (
                          <div
                            key={Icon.displayName ?? String(index)}
                            style={{
                              width: 64,
                              height: 64,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                              background: hit > 0.5 ? "var(--foreground)" : "transparent",
                              color: hit > 0.5 ? "var(--background)" : "var(--foreground)",
                            }}
                          >
                            <Icon size={32} />
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                  <Caret frame={frame} typing={frame < ENTER && typed.length < COMMAND.length} size={g.font} />
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
