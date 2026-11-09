import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS } from "../design/beat";
import { gold } from "../design/gold";
import type { ShotPlan } from "./timelines";

const MONO = "var(--font-mono)";

/** Stands in for a shot until its real scene lands: names the shot and steps one dot per beat so the tempo map is visible in Studio. */
export function Placeholder({ shot }: { shot: ShotPlan }) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const tall = width < 1500;
  const beatNow = Math.min(Math.floor((frame * shot.bpm) / (60 * FPS)), shot.beats - 1);
  const dots = Array.from({ length: shot.beats }, (_, i) => i);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28, fontFamily: MONO }}>
      <div style={{ fontSize: tall ? 56 : 96, color: gold(1) }}>{`S${shot.number} ${shot.label}`}</div>
      <div style={{ fontSize: 32, opacity: 0.7 }}>{`${shot.beats} beats @ ${shot.bpm} bpm, ${shot.frames} frames`}</div>
      <div style={{ display: "flex", gap: 14 }}>
        {dots.map((dot) => (
          <div
            key={dot}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: gold(dot === beatNow ? 1 : 0),
              opacity: dot <= beatNow ? 1 : 0.2,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}
