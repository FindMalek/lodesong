import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { clock } from "../copy";
import { Caret, typedCount } from "../design/typing";
import { filmPlate, RealCrop } from "./s8-real-crop";

const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };
const PLATE = { w: 1440, h: 810 };
const MONO = "var(--font-mono)";
const FONT = 38;
const COVER = 150;
const COMMAND = "/lodesong pause";
const LENGTH = 222;

interface TerminalState {
  frame: number;
  landings: readonly number[];
  enter: number;
  seconds: number;
}

/** Claude Code with the lodesong skill, drawn because a terminal cannot be captured: the command pauses the song and the transport flips to play. */
export function TerminalMock({ frame, landings, enter, seconds }: TerminalState) {
  const paused = frame >= enter;
  const typed = paused ? "" : COMMAND.slice(0, typedCount(frame, landings));
  const typing = !paused && typed.length < COMMAND.length;
  const ratio = seconds / LENGTH;
  const Icon = paused ? PlayIcon : PauseIcon;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: MONO, fontSize: FONT, color: "var(--foreground)" }}>
      <div style={{ position: "absolute", left: 48, top: 40, right: 48, display: "flex", gap: 32, opacity: paused ? 0.6 : 1 }}>
        <div style={{ width: COVER, height: COVER, flexShrink: 0, overflow: "hidden" }}>
          <RealCrop src={filmPlate("queue/queue")} box={COVER_BOX} plate={PLATE} width={COVER} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div data-legible="" style={{ fontSize: FONT + 4, fontWeight: 600, whiteSpace: "nowrap" }}>
            signal violet pt. 2
          </div>
          <div style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>satellite garden</div>
          <div data-legible="" style={{ color: "var(--ignite)", whiteSpace: "nowrap" }}>
            “i keep the lights on”
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
        <span>{clock(seconds)}</span>
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
        <span>{clock(LENGTH)}</span>
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
          {typed}
          <Caret frame={frame} typing={typing} size={FONT} />
        </span>
      </div>
    </div>
  );
}
