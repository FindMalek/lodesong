import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import home from "../../../../../docs/home.png";
import { COPY, FILM } from "../../copy";
import { ease, lerp, ramp } from "../../design/motion";
import { Caret } from "../../design/typing";
import { revealed } from "./reveal";

const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";
const MONO = "var(--font-mono)";

const DOCKER = FILM.end.docker.join("\n");

/** Land: the app pulls back front-on and goes quiet, the wordmark and the one command arrive, the last frame holds sharp. */
export function FinaleScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pull = ease.inOut(ramp(frame, 0, durationInFrames * 0.55, (t) => t));
  const shown = revealed(frame, Math.round(durationInFrames * 0.42), durationInFrames * 0.3, DOCKER.length);
  const lit = ramp(frame, 0, durationInFrames * 0.5);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${lerp(1.18, 1, pull)})`, filter: `brightness(${lerp(1.1, 0.22, lit)}) blur(${lerp(0, 6, lit)}px)` }}>
        <Img src={home} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: ramp(frame, durationInFrames * 0.18, 18),
          background: "radial-gradient(ellipse 50% 50% at 50% 42%, color-mix(in oklch, var(--ignite) 10%, transparent), transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36, fontFamily: MONO, fontSize: 170, fontWeight: 500, letterSpacing: "-0.04em" }}>
          <svg aria-hidden width={150} height={150} viewBox="8 8 48 48" fill="var(--ignite)">
            <path d={VEIN} />
          </svg>
          lodesong
        </div>
        <div style={{ fontSize: 76, fontWeight: 500, letterSpacing: "-0.04em", marginTop: 14 }}>
          {COPY.headline[0]} <span style={{ color: "var(--muted-foreground)" }}>{COPY.headline[1]}</span>
        </div>
        <div
          style={{
            marginTop: 54,
            padding: "26px 36px",
            border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
            background: "color-mix(in oklch, black 80%, transparent)",
            fontFamily: MONO,
            fontSize: 36,
            lineHeight: 1.5,
            whiteSpace: "pre",
            minHeight: 36 * 1.5 * 3 + 52,
            minWidth: 1020,
            opacity: ramp(frame, durationInFrames * 0.36, 10),
          }}
        >
          {DOCKER.slice(0, shown)}
          <Caret frame={frame} typing={shown < DOCKER.length} size={36} color="var(--ignite)" />
        </div>
        <div style={{ marginTop: 34, fontFamily: MONO, fontSize: 44, opacity: ramp(frame, durationInFrames * 0.78, 12) }}>{FILM.end.url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
