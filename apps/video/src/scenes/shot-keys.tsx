import { Sequence, useCurrentFrame } from "remotion";
import { plateSrc } from "../captures/film-manifest";
import { type Cam, Camera } from "../design/camera";
import { Label } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Plate, plateLayout } from "../design/plate";
import { whipProgress, whipSpeed } from "../design/whip";
import { Keycap, pressAt } from "../ui/keycap";
import { type CutMove, cutFrames, type KeyCut, S10_CUTS, STRIKE } from "./s10-plan";

const LAYOUT = plateLayout({ w: 1440, h: 810 });
const STAGE_W = 1920;
const STAGE_H = 1080;
const SHIFT = 240;
const KEY = 216;
const WHIP_FRAMES = 6;
const FILTER_ID = "s10-whip";

const whipDirection = (move: CutMove): number => (move === "whip-left" ? 1 : move === "whip-right" ? -1 : 0);

function camOf(cut: KeyCut, frame: number, frames: number): Cam {
  const t = ramp(frame, 0, frames, ease.inOut);
  const scale = lerp(cut.scale[0], cut.scale[1], t);
  const cx = LAYOUT.left + (cut.focus.x + cut.focus.w / 2) * LAYOUT.k;
  const cy = LAYOUT.top + (cut.focus.y + cut.focus.h / 2) * LAYOUT.k;
  const midY = Math.min(STAGE_H - STAGE_H / (2 * scale), Math.max(STAGE_H / (2 * scale), cy));
  const midX = Math.min(STAGE_W - (STAGE_W / 2 - SHIFT) / scale, cx);
  return { x: scale * (midX - STAGE_W / 2) - SHIFT, y: scale * (midY - STAGE_H / 2), scale, rx: 0, ry: lerp(-2, 0, t) };
}

function Cap({ legend, frame, strike }: { legend: string; frame: number; strike: number }) {
  const landed = frame >= strike;
  const stamp = ramp(frame, strike, 4);
  return (
    <div style={{ opacity: landed ? 1 : 0, transform: `scale(${lerp(1.28, 1, stamp)})`, transformOrigin: "50% 100%" }}>
      <Keycap label={legend} size={KEY} wide={legend.length > 1} bright={frame < strike + 3} press={pressAt(frame, strike, 2, 7)} legible />
    </div>
  );
}

function Cut({ cut, frames, strikes }: { cut: KeyCut; frames: number; strikes: number[] }) {
  const frame = useCurrentFrame();
  const cam = camOf(cut, frame, frames);
  const dir = whipDirection(cut.move);
  const travel = STAGE_W * 0.3;
  const slide = dir * travel * (1 - whipProgress(frame, 0, WHIP_FRAMES));
  const streak = dir === 0 ? 0 : Math.min(120, whipSpeed(frame, 0, WHIP_FRAMES, travel) * 0.22);
  const soft = 6 * (1 - ramp(frame, STRIKE, 10));
  const filter = [
    streak > 0.5 ? `url(#${FILTER_ID})` : "",
    soft > 0.3 ? `blur(${soft.toFixed(2)}px)` : "",
    `brightness(${(1 + 0.4 * (1 - ramp(frame, 0, 6))).toFixed(3)})`,
  ]
    .filter(Boolean)
    .join(" ");
  const mark = cut.mark;
  const markIn = ramp(frame, (strikes[0] ?? 0) + 3, 8);
  const pad = 14;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <filter id={FILTER_ID} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`${streak} 0`} />
        </filter>
      </svg>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${slide}px)`, filter }}>
        <Camera cam={cam}>
          <Plate
            src={plateSrc(cut.take, cut.plate)}
            layout={LAYOUT}
            brightness={2.4}
            light={{
              x: cut.focus.x + cut.focus.w / 2,
              y: cut.focus.y + cut.focus.h / 2,
              radius: 700,
              dim: 0.85,
              wash: 0.02,
            }}
          >
            {mark ? (
              <div
                style={{
                  position: "absolute",
                  left: mark.x - pad,
                  top: mark.y - pad,
                  width: mark.w + pad * 2,
                  height: mark.h + pad * 2,
                  border: "2px solid var(--ignite)",
                  opacity: markIn,
                  transform: `scale(${lerp(1.7, 1, markIn)})`,
                }}
              />
            ) : null}
          </Plate>
        </Camera>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgb(0 0 0 / 0.92) 0, rgb(0 0 0 / 0.9) 460px, rgb(0 0 0 / 0.4) 760px, transparent 980px)",
        }}
      />
      <div style={{ position: "absolute", left: 110, top: 300, display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ display: "flex", gap: 28 }}>
          {cut.keys.map((legend, i) => (
            <Cap key={legend} legend={legend} frame={frame} strike={strikes[i] ?? 0} />
          ))}
        </div>
        <div style={{ opacity: ramp(frame, STRIKE + 1, 5), transform: `translateY(${lerp(14, 0, ramp(frame, STRIKE + 1, 6))}px)` }}>
          <Label legible style={{ fontSize: 44, color: "var(--foreground)", letterSpacing: "0.04em", textTransform: "none" }}>
            {cut.chip}
          </Label>
        </div>
      </div>
    </div>
  );
}

export function KeysShot() {
  return (
    <>
      {S10_CUTS.map((cut) => {
        const { from, frames, strikes } = cutFrames(cut);
        return (
          <Sequence key={cut.id} from={from} durationInFrames={frames} name={cut.id}>
            <Cut cut={cut} frames={frames} strikes={strikes} />
          </Sequence>
        );
      })}
    </>
  );
}
