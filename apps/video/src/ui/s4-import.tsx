import { useCurrentFrame } from "remotion";
import { ease, ramp } from "../design/motion";
import { flat } from "./s4-kit";

const BAR_X = 795.5;
const PANEL = flat(27);
const BAR_W = 96.5;
const BARS = [
  { y: 196, share: 2 / 3 },
  { y: 233, share: 1 },
];

/** Plain panels over the capture's own words about where the songs come from: the page reads as a library being filled, nothing else. */
export function ImportCovers() {
  return (
    <>
      <div style={{ position: "absolute", left: 215, top: 52, width: 700, height: 116, background: PANEL }} />
      <div
        style={{
          position: "absolute",
          left: 220,
          top: 56,
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--foreground)",
          lineHeight: "20px",
        }}
      >
        import your library
      </div>
      <div style={{ position: "absolute", left: 300, top: 361, width: 520, height: 20, background: PANEL }} />
    </>
  );
}

/** The two progress bars on the import page filling: painted over the capture's finished bars, gold fill on the app's own track. */
export function ImportBars({ from }: { from: number }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, 40, ease.inOut);
  return (
    <>
      <div style={{ position: "absolute", left: BAR_X - 4, top: 188, width: BAR_W + 8, height: 56, background: flat(27) }} />
      <div style={{ position: "absolute", left: BAR_X - 4, top: 216, width: BAR_W + 8, height: 1, background: flat(65) }} />
      {BARS.map((bar) => (
        <div key={bar.y}>
          <div style={{ position: "absolute", left: BAR_X, top: bar.y, width: BAR_W, height: 4, background: flat(49) }} />
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
