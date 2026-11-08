import type { CSSProperties, ReactNode } from "react";
import { Img } from "remotion";
import { Label } from "./kinetic";

type DeviceKind = "iphone" | "android" | "mac";

const DEFAULT_NOTE = "frame art, real capture";

interface DeviceFrameProps {
  kind: DeviceKind;
  width: number;
  src?: string;
  children?: ReactNode;
  label?: string;
  /** Honest disclosure: the frame is art, the screen is a real capture. `false` only if the shot says so elsewhere. */
  note?: string | false;
  style?: CSSProperties;
}

interface Shape {
  ratio: number;
  bezel: number;
  radius: number;
  screenRadius: number;
}

const SHAPES: Record<DeviceKind, Shape> = {
  iphone: { ratio: 2532 / 1170, bezel: 0.034, radius: 0.15, screenRadius: 0.118 },
  android: { ratio: 2532 / 1170, bezel: 0.028, radius: 0.095, screenRadius: 0.068 },
  mac: { ratio: 900 / 1440, bezel: 0.011, radius: 0.016, screenRadius: 0.008 },
};

const GLASS = "linear-gradient(115deg, rgb(255 255 255 / 0.07) 0%, transparent 32%, transparent 70%, rgb(255 255 255 / 0.03) 100%)";

/** Phone and laptop frames in the film's hairline language around a real capture. */
export function DeviceFrame({ kind, width, src, children, label, note = DEFAULT_NOTE, style }: DeviceFrameProps) {
  const shape = SHAPES[kind];
  const bezel = width * shape.bezel;
  const screenW = width - bezel * 2;
  const screenH = screenW * shape.ratio;
  const height = screenH + bezel * 2;
  const mac = kind === "mac";
  return (
    <div style={{ position: "absolute", width, height, ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#080808",
          borderRadius: width * shape.radius,
          border: "1.5px solid rgb(255 255 255 / 0.16)",
          boxShadow: "0 0 0 1px #000, 0 50px 110px rgb(0 0 0 / 0.7)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: bezel,
          top: bezel,
          width: screenW,
          height: screenH,
          borderRadius: width * shape.screenRadius,
          overflow: "hidden",
          background: "var(--background)",
        }}
      >
        {src ? (
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
        ) : (
          children
        )}
        <div style={{ position: "absolute", inset: 0, background: GLASS, pointerEvents: "none" }} />
      </div>
      {kind === "iphone" ? (
        <i
          style={{
            position: "absolute",
            top: bezel + width * 0.022,
            left: "50%",
            width: width * 0.27,
            height: width * 0.078,
            marginLeft: -width * 0.135,
            borderRadius: width,
            background: "#000",
          }}
        />
      ) : null}
      {kind === "android" ? (
        <i
          style={{
            position: "absolute",
            top: bezel + width * 0.024,
            left: "50%",
            width: width * 0.04,
            height: width * 0.04,
            marginLeft: -width * 0.02,
            borderRadius: "50%",
            background: "#000",
          }}
        />
      ) : null}
      {mac ? (
        <>
          <i
            style={{
              position: "absolute",
              top: bezel,
              left: "50%",
              width: width * 0.1,
              height: width * 0.018,
              marginLeft: -width * 0.05,
              borderRadius: `0 0 ${width * 0.008}px ${width * 0.008}px`,
              background: "#080808",
            }}
          />
          <i
            style={{
              position: "absolute",
              left: -width * 0.045,
              top: height - 1,
              width: width * 1.09,
              height: width * 0.017,
              borderRadius: `0 0 ${width * 0.03}px ${width * 0.03}px`,
              background: "linear-gradient(#2a2a2a, #111)",
              boxShadow: "0 22px 40px rgb(0 0 0 / 0.55)",
            }}
          />
        </>
      ) : null}
      {label || note ? (
        <div
          style={{
            position: "absolute",
            top: height + (mac ? width * 0.06 : 28),
            left: 0,
            width,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          {label ? (
            <Label legible style={{ fontSize: 28, color: "var(--foreground)" }}>
              {label}
            </Label>
          ) : null}
          {note ? (
            <Label legible style={{ fontSize: 28, textTransform: "none", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
              {note}
            </Label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
