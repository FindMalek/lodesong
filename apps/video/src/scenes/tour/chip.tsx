import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { ease, ramp } from "../../design/motion";
import { type Chapter, chapterRange, FEATURES, type Feature } from "../../features";
import type { Lane } from "./spec";

export const SAFE = { x: 96, y: 54 };

const KEYS = new Set(["y", "f", "b", "g", "h", "j", "k", "x", "n", "p", "i", "?", "[", "]", "space", "0", "9"]);
const isKey = (token: string): boolean => KEYS.has(token) || /[⌘⇧⌥⌃↵←→]/.test(token);

const keycap: CSSProperties = {
  display: "inline-block",
  minWidth: "1.35em",
  padding: "0 0.28em",
  textAlign: "center",
  border: "1.5px solid color-mix(in oklch, var(--foreground) 55%, transparent)",
  borderBottomWidth: 4,
  background: "color-mix(in oklch, var(--foreground) 10%, transparent)",
};

function Label({ text }: { text: string }) {
  const tokens = text.split(" ");
  return (
    <>
      {tokens.map((token, i) => (
        <span key={tokens.slice(0, i + 1).join(" ")} style={isKey(token.replace(",", "")) ? keycap : undefined}>
          {token}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

interface ChipProps {
  feature: Feature;
  age: number;
  host: boolean;
  end: boolean;
}

function Chip({ feature, age, host, end }: ChipProps) {
  const t = ramp(age, 0, 5, ease.out);
  return (
    <div
      data-feature={feature.id}
      style={{
        alignSelf: end ? "flex-end" : "flex-start",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        fontSize: host ? 36 : 32,
        lineHeight: 1.1,
        letterSpacing: "-0.01em",
        padding: host ? "12px 22px" : "9px 20px",
        color: host ? "var(--background)" : "var(--foreground)",
        background: host ? "var(--foreground)" : "color-mix(in oklch, var(--background) 88%, transparent)",
        border: host
          ? "2px solid color-mix(in oklch, var(--background) 70%, transparent)"
          : "1px solid color-mix(in oklch, var(--foreground) 24%, transparent)",
        borderLeft: host ? undefined : "5px solid var(--ignite)",
        boxShadow: "0 6px 28px rgb(0 0 0 / 0.5)",
        opacity: Math.min(1, t * 1.2),
        transform: `translateX(${(1 - t) * (end ? 36 : -36)}px)`,
        whiteSpace: "nowrap",
      }}
    >
      <Label text={feature.label} />
    </div>
  );
}

const LANES: Record<Lane, CSSProperties> = {
  bl: { left: SAFE.x, bottom: 130, flexDirection: "column-reverse", alignItems: "flex-start" },
  tl: { left: SAFE.x, top: SAFE.y + 24, flexDirection: "column", alignItems: "flex-start" },
  br: { right: SAFE.x, bottom: 130, flexDirection: "column-reverse", alignItems: "flex-end" },
  tr: { right: SAFE.x, top: SAFE.y + 24, flexDirection: "column", alignItems: "flex-end" },
};

export function ChipStack({ chapter, lanes }: { chapter: Chapter; lanes: Record<string, Lane> }) {
  const local = useCurrentFrame();
  const at = chapterRange(chapter)[0] + local;
  const live = FEATURES.filter((feature) => feature.chapter === chapter && at >= feature.tour[0] && at < feature.tour[1]).sort(
    (a, b) => a.tour[0] - b.tour[0],
  );
  const lane = lanes[live[0]?.rideOn ?? live[0]?.id ?? ""] ?? "bl";
  return (
    <div style={{ position: "absolute", display: "flex", gap: 10, ...LANES[lane] }}>
      {live.map((feature) => (
        <Chip key={feature.id} feature={feature} age={at - feature.tour[0]} host={feature.wow !== "C"} end={lane.endsWith("r")} />
      ))}
    </div>
  );
}
