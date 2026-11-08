import type { CSSProperties, ReactNode } from "react";
import { Label } from "../design/kinetic";

const EDGE = "1px solid color-mix(in oklch, var(--foreground) 22%, transparent)";

interface FrameProps {
  width: number;
  height: number;
  children: ReactNode;
  style?: CSSProperties;
}

/** A desktop window drawn as hairlines: title bar with square controls, nothing rounded, no shadow theatre. */
export function Window({ width, height, title, children, style }: FrameProps & { title: string }) {
  return (
    <div
      data-panel="window"
      style={{
        position: "absolute",
        width,
        height,
        background: "var(--background)",
        border: EDGE,
        overflow: "hidden",
        boxShadow: "0 60px 140px rgb(0 0 0 / 0.6)",
        ...style,
      }}
    >
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <i key={i} style={{ width: 12, height: 12, border: "1px solid var(--muted-foreground)", opacity: 0.7 }} />
        ))}
        <Label style={{ marginLeft: 16, fontSize: 20, letterSpacing: "0.04em" }}>{title}</Label>
      </div>
      <div style={{ position: "absolute", inset: "52px 0 0 0" }}>{children}</div>
    </div>
  );
}

/** A phone as a hairline slab with a square island: no brand, no bezel render. */
export function Phone({ width, height, children, style }: FrameProps) {
  return (
    <div
      data-panel="phone"
      style={{
        position: "absolute",
        width,
        height,
        background: "var(--background)",
        border: "2px solid color-mix(in oklch, var(--foreground) 34%, transparent)",
        overflow: "hidden",
        boxShadow: "0 50px 120px rgb(0 0 0 / 0.7)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 18,
          left: "50%",
          width: 96,
          height: 24,
          marginLeft: -48,
          background: "var(--foreground)",
          opacity: 0.12,
        }}
      />
      {children}
    </div>
  );
}
