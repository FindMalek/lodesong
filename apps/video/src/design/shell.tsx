import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FontGate } from "./fonts";
import { Grain, Vignette } from "./grain";
import { VOID } from "./kinetic";
import { Probe } from "./probe";

interface ShellProps {
  children: ReactNode;
  audio?: string;
  grain?: boolean;
  probe?: boolean;
  grainOutAt?: number;
}

const GRAIN_OUT_FRAMES = 12;
const GRAIN = 0.07;

/** Everything a shot shares: fonts held, the void, the dark theme, vignette, grain, and one score. Grain fades to nothing over the 12 frames from `grainOutAt`. */
export function Shell({ children, audio, grain = true, probe = false, grainOutAt }: ShellProps) {
  const frame = useCurrentFrame();
  const grainOpacity =
    grainOutAt === undefined
      ? GRAIN
      : interpolate(frame, [grainOutAt, grainOutAt + GRAIN_OUT_FRAMES - 1], [GRAIN, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return (
    <FontGate>
      <AbsoluteFill className="dark" style={{ background: VOID, color: "var(--foreground)", fontFamily: "var(--font-sans)" }}>
        {children}
        <Vignette />
        {grain && grainOpacity > 0 ? <Grain opacity={grainOpacity} /> : null}
        {audio ? <Audio src={staticFile(audio)} /> : null}
        {probe ? <Probe /> : null}
      </AbsoluteFill>
    </FontGate>
  );
}
