import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { clock } from "../copy";
import { gold } from "../design/gold";
import { ease, ramp } from "../design/motion";
import { Caret, typedCount } from "../design/typing";
import { DitherCover } from "./dither-cover";
import { filmPlate, RealCrop } from "./s8-real-crop";

const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };
const PLATE = { w: 1440, h: 810 };
const MONO = "var(--font-mono)";
const FONT = 38;
const COVER = 150;

export interface TerminalState {
  frame: number;
  first: readonly number[];
  second: readonly number[];
  enterFirst: number;
  enterSecond: number;
  position: number;
}

const COMMANDS = ["/lodesong next", "/lodesong pause"] as const;

const NOW = [
  { track: "signal violet pt. 2", artist: "satellite garden", line: "i keep the lights on", length: 222 },
  { track: "static echo at night", artist: "satellite garden", line: "hold the signal violet", length: 198 },
] as const;

/** Claude Code with the lodesong skill, drawn as a mock: a terminal cannot be captured, so the shot labels it. */
export function TerminalMock({ frame, first, second, enterFirst, enterSecond, position }: TerminalState) {
  const nextDone = frame >= enterFirst;
  const paused = frame >= enterSecond;
  const track = NOW[nextDone ? 1 : 0] ?? NOW[0];
  const swap = ramp(frame, enterFirst, 14, ease.out);
  const typedFirst = COMMANDS[0].slice(0, typedCount(frame, first));
  const typedSecond = COMMANDS[1].slice(0, typedCount(frame, second));
  const typing = !nextDone ? typedFirst.length < COMMANDS[0].length : !paused && typedSecond.length < COMMANDS[1].length;
  const shown = nextDone ? typedSecond : typedFirst;
  const ratio = position / track.length;
  const Icon = paused ? PlayIcon : PauseIcon;
  const dim = paused ? 0.55 : 1;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: MONO, fontSize: FONT, color: "var(--foreground)" }}>
      <div style={{ position: "absolute", left: 48, top: 40, right: 48, display: "flex", gap: 32, opacity: dim }}>
        <div style={{ width: COVER, height: COVER, flexShrink: 0, overflow: "hidden" }}>
          {nextDone ? (
            <DitherCover id="static-echo-at-night" size={COVER} develop={swap} time={frame / 60} color={gold(1)} />
          ) : (
            <RealCrop src={filmPlate("queue/queue")} box={COVER_BOX} plate={PLATE} width={COVER} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div data-legible="" style={{ fontSize: FONT + 4, fontWeight: 600, whiteSpace: "nowrap" }}>
            {track.track}
          </div>
          <div style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{track.artist}</div>
          <div data-legible="" style={{ color: "var(--ignite)", whiteSpace: "nowrap" }}>
            “{track.line}”
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 240,
          display: "flex",
          alignItems: "center",
          gap: 26,
          color: "var(--muted-foreground)",
        }}
      >
        <span>{clock(position)}</span>
        <div style={{ position: "relative", flex: 1, height: 6, background: "var(--border)" }}>
          <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${ratio * 100}%`, background: "var(--ignite)" }} />
          <i
            style={{
              position: "absolute",
              top: -9,
              left: `calc(${ratio * 100}% - 12px)`,
              width: 24,
              height: 24,
              background: "var(--ignite)",
            }}
          />
        </div>
        <span>{clock(track.length)}</span>
        <div style={{ display: "flex", gap: 14, color: "var(--foreground)" }}>
          {[SkipBackIcon, Icon, SkipForwardIcon].map((One, i) => (
            <div
              key={String(i)}
              style={{
                width: 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                background: i === 1 && paused ? "var(--foreground)" : "transparent",
                color: i === 1 && paused ? "var(--background)" : "var(--foreground)",
              }}
            >
              <One size={34} />
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 40,
          height: 96,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 28px",
          border: "1px solid color-mix(in oklch, var(--foreground) 35%, transparent)",
        }}
      >
        <span style={{ color: "var(--ignite)" }}>&gt;</span>
        <span data-legible="">
          {shown}
          <Caret frame={frame} typing={typing} size={FONT} />
        </span>
      </div>
    </div>
  );
}
