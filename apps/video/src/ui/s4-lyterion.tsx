import { useCurrentFrame } from "remotion";
import { ease, ramp } from "../design/motion";
import { flat } from "./s4-kit";

const BAR_X = 795.5;
const BAR_W = 96.5;
const BARS = [
  { y: 196, share: 2 / 3 },
  { y: 233, share: 1 },
];

/** The two progress bars on the import page filling to what Lyterion has found so far: painted over the capture's finished bars, gold fill on the app's own track. */
export function ImportBars({ from }: { from: number }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, 40, ease.inOut);
  return (
    <>
      <div style={{ position: "absolute", left: BAR_X - 4, top: 188, width: BAR_W + 8, height: 56, background: flat(16) }} />
      <div style={{ position: "absolute", left: BAR_X - 4, top: 216, width: BAR_W + 8, height: 1, background: flat(38) }} />
      {BARS.map((bar) => (
        <div key={bar.y}>
          <div style={{ position: "absolute", left: BAR_X, top: bar.y, width: BAR_W, height: 4, background: flat(29) }} />
          <div
            style={{
              position: "absolute",
              left: BAR_X,
              top: bar.y,
              width: BAR_W * bar.share * t,
              height: 4,
              background: "var(--ignite)",
              boxShadow: "0 0 8px color-mix(in oklch, var(--ignite) 60%, transparent)",
            }}
          />
        </div>
      ))}
    </>
  );
}
