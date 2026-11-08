import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { FontGate } from "./fonts";
import { Grain, Vignette } from "./grain";
import { VOID } from "./kinetic";
import { Probe } from "./probe";

interface ShellProps {
  children: ReactNode;
  audio?: string;
  grain?: boolean;
  probe?: boolean;
}

/** Everything a shot shares: fonts held, the void, the dark theme, vignette, grain, and one score. */
export function Shell({ children, audio, grain = true, probe = false }: ShellProps) {
  return (
    <FontGate>
      <AbsoluteFill className="dark" style={{ background: VOID, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
        {children}
        <Vignette />
        {grain ? <Grain /> : null}
        {audio ? <Audio src={staticFile(audio)} /> : null}
        {probe ? <Probe /> : null}
      </AbsoluteFill>
    </FontGate>
  );
}
