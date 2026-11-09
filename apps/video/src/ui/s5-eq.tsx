import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { ease, lerp, ramp } from "../design/motion";
import type { Box } from "../design/probe";

const BANDS = [1088, 1124, 1159, 1195, 1231, 1266, 1302, 1337, 1372, 1407];
const CENTER_Y = 304;
const PX_PER_DB = 6.4;
const SPAN = 12 * PX_PER_DB;
const FLAT = "rgb(37 37 37)";
const TRACK = { x: 1068, y: 196, w: 362, h: 194 };

const FLAT_PRESET = Array.from({ length: 10 }, () => 0);
export const BASS_PRESET = [6, 5, 4, 2, 0, 0, 0, 0, 0, 0];
export const TREBLE_PRESET = [0, 0, 0, 0, 0, 1, 2, 4, 5, 6];

export const CHIPS: Record<string, Box> = {
  flat: { x: 1072, y: 129, w: 50, h: 24 },
  bass: { x: 1127, y: 129, w: 92, h: 24 },
  treble: { x: 1221, y: 129, w: 106, h: 24 },
};

const CHIP_LABEL: Record<string, string> = { flat: "flat", bass: "bass boost", treble: "treble boost" };

const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 13.5, letterSpacing: "0.02em", whiteSpace: "nowrap" };

function Chip({ name, selected }: { name: string; selected: boolean }) {
  const box = CHIPS[name];
  if (!box) return null;
  return (
    <div
      style={{
        ...mono,
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: selected ? "rgb(235 235 235)" : FLAT,
        color: selected ? "rgb(16 16 16)" : "rgb(235 235 235)",
        border: selected ? "1px solid rgb(235 235 235)" : "1px solid rgb(60 60 60)",
        boxSizing: "border-box",
      }}
    >
      {CHIP_LABEL[name]}
    </div>
  );
}

export interface PresetChange {
  at: number;
  chip: "flat" | "bass" | "treble";
  bands: readonly number[];
}

const ROLL = 14;

function gainsAt(frame: number, changes: readonly PresetChange[]): number[] {
  let from: readonly number[] = FLAT_PRESET;
  let gains: number[] = [...FLAT_PRESET];
  for (const change of changes) {
    const t = ramp(frame, change.at, ROLL, ease.out);
    gains = from.map((value, i) => lerp(value, change.bands[i] ?? 0, t));
    if (frame < change.at + ROLL) return gains;
    from = change.bands;
  }
  return gains;
}

const label = (db: number): string => (Math.abs(db) < 0.5 ? "0" : `${db > 0 ? "+" : "-"}${Math.round(Math.abs(db))}`);

/** The ten equalizer sliders over the real capture: the capture's own thumbs are painted out and the bands re-seated to a preset in the app's idiom (hairline track, square thumb), the gold fill running out from 0 dB. */
export function EqBands({ changes }: { changes: readonly PresetChange[] }) {
  const frame = useCurrentFrame();
  const gains = gainsAt(frame, changes);
  const chosen = [...changes].reverse().find((change) => frame >= change.at)?.chip ?? "flat";
  return (
    <>
      <div style={{ position: "absolute", left: TRACK.x, top: TRACK.y, width: TRACK.w, height: TRACK.h, background: FLAT }} />
      {Object.keys(CHIPS).map((name) => (
        <Chip key={name} name={name} selected={name === chosen} />
      ))}
      {BANDS.map((x, i) => {
        const db = gains[i] ?? 0;
        const y = CENTER_Y - db * PX_PER_DB;
        return (
          <div key={x}>
            <div
              style={{ position: "absolute", left: x - 1, top: CENTER_Y - SPAN, width: 2, height: SPAN * 2, background: "rgb(70 70 70)" }}
            />
            <div
              style={{
                position: "absolute",
                left: x - 2,
                top: Math.min(y, CENTER_Y),
                width: 4,
                height: Math.abs(CENTER_Y - y),
                background: "var(--ignite)",
                boxShadow: Math.abs(db) > 0.5 ? "0 0 8px color-mix(in oklch, var(--ignite) 60%, transparent)" : undefined,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x - 6,
                top: y - 6,
                width: 12,
                height: 12,
                boxSizing: "border-box",
                background: "rgb(30 30 30)",
                border: `1px solid ${Math.abs(db) > 0.5 ? "var(--ignite)" : "rgb(200 200 200)"}`,
              }}
            />
            <div
              style={{
                ...mono,
                position: "absolute",
                left: x - 14,
                top: 206,
                width: 28,
                textAlign: "center",
                color: Math.abs(db) > 0.5 ? "var(--ignite)" : "rgb(120 120 120)",
              }}
            >
              {label(db)}
            </div>
          </div>
        );
      })}
    </>
  );
}
