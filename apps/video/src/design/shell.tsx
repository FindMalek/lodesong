import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { FPS } from "./beat";
import { FontGate } from "./fonts";
import { Grain, Vignette } from "./grain";
import { Label, VOID } from "./kinetic";
import { MARK } from "./layout";
import { Probe } from "./probe";

export function timecode(frame: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `00:00:${pad(Math.floor(frame / FPS))}:${pad(frame % FPS)}`;
}

export function Marks() {
  const arm = 28;
  const line = { position: "absolute", background: "var(--muted-foreground)", opacity: 0.6 } as const;
  return (
    <>
      {[0, 1, 2, 3].map((corner) => {
        const left = corner % 2 === 0;
        const top = corner < 2;
        const h = { ...line, width: arm, height: 1, [left ? "left" : "right"]: MARK, [top ? "top" : "bottom"]: MARK } as const;
        const v = { ...line, width: 1, height: arm, [left ? "left" : "right"]: MARK, [top ? "top" : "bottom"]: MARK } as const;
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

interface ShellProps {
  children: ReactNode;
  audio?: string;
  grain?: boolean;
  chrome?: boolean;
  probe?: boolean;
  /** frames added to the timecode, so a scene shown alone still counts from where it sits in the film */
  clock?: number;
}

/** Everything a shot shares: fonts held, the void, the dark theme, vignette, crop marks, timecode, grain, and one score. */
export function Shell({ children, audio, grain = true, chrome = true, probe = false, clock = 0 }: ShellProps) {
  const frame = useCurrentFrame();
  return (
    <FontGate>
      <AbsoluteFill className="dark" style={{ background: VOID, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
        {children}
        <Vignette />
        {chrome ? (
          <>
            <Marks />
            <div data-furniture="" style={{ position: "absolute", right: MARK + 44, top: MARK - 10, opacity: 0.8 }}>
              <Label style={{ fontSize: 20 }}>{timecode(frame + clock)}</Label>
            </div>
          </>
        ) : null}
        {grain ? <Grain /> : null}
        {audio ? <Audio src={staticFile(audio)} /> : null}
        {probe ? <Probe /> : null}
      </AbsoluteFill>
    </FontGate>
  );
}
