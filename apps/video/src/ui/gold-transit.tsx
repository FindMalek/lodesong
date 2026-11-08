import { glowOf, gold } from "../design/gold";
import { lerp } from "../design/motion";
import { DitherCover } from "./dither-cover";

const NATIVE = 300;

export interface Spot {
  cx: number;
  cy: number;
  size: number;
}

interface GoldTransitProps {
  from: Spot;
  to: Spot;
  /** 0 to 1 */
  progress: number;
  time: number;
  /** lifts the cover along a bow, in px, so it travels rather than slides */
  arc?: number;
}

/** The gold cover as a thread: it leaves where the last shot left it and lands where this shot wants it. Only drawn in flight. */
export function GoldTransit({ from, to, progress, time, arc = 0 }: GoldTransitProps) {
  if (progress <= 0 || progress >= 1) return null;
  const size = lerp(from.size, to.size, progress);
  const cx = lerp(from.cx, to.cx, progress);
  const cy = lerp(from.cy, to.cy, progress) - Math.sin(Math.PI * progress) * arc;
  const halo = size * 1.5;
  return (
    <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, width: size, height: size }}>
      <div
        style={{
          position: "absolute",
          left: (size - halo) / 2,
          top: (size - halo) / 2,
          width: halo,
          height: halo,
          background: glowOf(1, 26),
        }}
      />
      <div style={{ position: "relative", width: NATIVE, height: NATIVE, transform: `scale(${size / NATIVE})`, transformOrigin: "0 0" }}>
        <DitherCover id="quiet-hours-ii" size={NATIVE} time={time * 0.5} color={gold(1)} />
      </div>
    </div>
  );
}
