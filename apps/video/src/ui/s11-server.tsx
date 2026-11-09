import { Folder, Server } from "lucide-react";
import { gold } from "../design/gold";
import { ease, lerp, ramp } from "../design/motion";

const NODES = [
  { x: 340, label: "your music" },
  { x: 960, label: "your server" },
  { x: 1580, label: "lodesong" },
] as const;
const VEIN = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";
const ICON = 150;
const Y = 470;

function Node({ index, frame }: { index: number; frame: number }) {
  const node = NODES[index];
  const last = index === NODES.length - 1;
  const p = ramp(frame, 2 + index * 12, 8);
  return (
    <div
      style={{
        position: "absolute",
        left: (node?.x ?? 0) - 220,
        top: Y - ICON / 2,
        width: 440,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 34,
        opacity: p,
        transform: `translateY(${lerp(24, 0, p)}px)`,
        color: last ? gold(ramp(frame, 40, 10)) : "var(--foreground)",
      }}
    >
      {index === 0 ? <Folder size={ICON} strokeWidth={1.25} aria-hidden /> : null}
      {index === 1 ? <Server size={ICON} strokeWidth={1.25} aria-hidden /> : null}
      {last ? (
        <svg aria-hidden width={ICON} height={ICON} viewBox="8 8 48 48" fill="currentColor">
          <path d={VEIN} />
        </svg>
      ) : null}
      <span data-legible="" style={{ fontFamily: "var(--font-mono)", fontSize: 46, letterSpacing: "0.02em" }}>
        {node?.label}
      </span>
    </div>
  );
}

function Link({ from, frame }: { from: number; frame: number }) {
  const t = ramp(frame, 10 + from * 12, 14, ease.inOut);
  const x0 = (NODES[from]?.x ?? 0) + 130;
  const x1 = (NODES[from + 1]?.x ?? 0) - 130;
  return (
    <>
      <div style={{ position: "absolute", left: x0, top: Y - 1, width: (x1 - x0) * t, height: 2, background: "var(--ignite)" }} />
      <div
        style={{
          position: "absolute",
          left: x0 + (x1 - x0) * t - 9,
          top: Y - 9,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: "var(--ignite)",
          opacity: t > 0 && t < 1 ? 1 : 0,
        }}
      />
    </>
  );
}

/** Three plain steps in a row: your music folder, your own server, then lodesong; the gold line travels left to right. */
export function ServerFlow({ frame }: { frame: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Node index={0} frame={frame} />
      <Link from={0} frame={frame} />
      <Node index={1} frame={frame} />
      <Link from={1} frame={frame} />
      <Node index={2} frame={frame} />
    </div>
  );
}
