import { useCurrentFrame } from "remotion";
import { gold } from "../design/gold";
import { ease, lerp, ramp } from "../design/motion";
import { DitherCover } from "./dither-cover";
import { BRIGHT, Patch, plateFile } from "./s4-kit";

const OFF = plateFile("crossfade/off");
const SIX = plateFile("crossfade/six-seconds");
const FLAT = "rgb(37 37 37)";

const THUMB_FROM = 861;
const THUMB_TO = 945;

interface SliderProps {
  from: number;
  length: number;
}

export function CrossfadeSlider({ from, length }: SliderProps) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, length, ease.inOut);
  const x = lerp(THUMB_FROM, THUMB_TO, t);
  return (
    <>
      <div style={{ position: "absolute", left: 857, top: 261, width: 18, height: 18, background: FLAT }} />
      <Patch
        src={SIX}
        box={{ x: 856, y: 258, w: THUMB_TO - 856, h: 24 }}
        filter={BRIGHT}
        style={{ clipPath: `inset(0 ${(1 - t) * 100}% 0 0)` }}
      />
      <Patch src={SIX} box={{ x: THUMB_TO - 1, y: 262, w: 12, h: 16 }} at={{ x: x - 1, y: 262 }} filter={BRIGHT} />
      {t > 0.82 ? <Patch src={SIX} box={{ x: 1058, y: 258, w: 36, h: 24 }} filter={BRIGHT} /> : null}
      {t <= 0.82 ? <Patch src={OFF} box={{ x: 1058, y: 258, w: 36, h: 24 }} filter={BRIGHT} /> : null}
    </>
  );
}

export function Schematic() {
  return (
    <div
      data-legible=""
      style={{
        position: "absolute",
        right: 120,
        bottom: 60,
        fontFamily: "var(--font-mono)",
        fontSize: 28,
        letterSpacing: "0.04em",
        color: "var(--muted-foreground)",
      }}
    >
      schematic
    </div>
  );
}

const AUTO = { x: 1033, y: 351, w: 50, h: 28 };

export function NormalizationAuto({ from }: { from: number }) {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: AUTO.x,
        top: AUTO.y,
        width: AUTO.w,
        height: AUTO.h,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgb(235 235 235)",
        color: "rgb(16 16 16)",
        border: "1px solid rgb(235 235 235)",
        fontFamily: "var(--font-mono)",
        fontSize: 14.5,
      }}
    >
      auto
    </div>
  );
}

const DECK = { x: 150, y: 620, w: 1620, h: 300 };
const LANE = { x0: 470, x1: 1700, h: 82 };
const PX_PER_S = 62;
const OVERLAP = 6 * PX_PER_S;
const A_END = 1200;
const B_START = A_END - OVERLAP;
const A_Y = 706;
const B_Y = 840;
const STEPS = 24;

const curve = (x0: number, x1: number, level: (u: number) => number, top: number): [number, number][] =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const u = i / STEPS;
    return [x0 + (x1 - x0) * u, top + LANE.h * (1 - level(u))];
  });

const linePath = (points: readonly [number, number][]): string =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

const areaPath = (points: readonly [number, number][], bottom: number): string => {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return "";
  return `${linePath(points)} L${last[0]} ${bottom} L${first[0]} ${bottom} Z`;
};

const equalOut = (u: number): number => Math.cos((u * Math.PI) / 2);
const equalIn = (u: number): number => Math.sin((u * Math.PI) / 2);

interface DeckProps {
  from: number;
  play: number;
  playLength: number;
}

/** What crossfade means, drawn honestly: the outgoing level falls on an equal-power curve while the next song's rises from the same instant, so the dithered areas overlap and the sum never dips. Covers carry the gold across. */
export function CrossfadeDeck({ from, play, playLength }: DeckProps) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, from, 14);
  if (rise <= 0) return null;
  const draw = ramp(frame, from + 8, 26, ease.inOut);
  const head = ramp(frame, play, playLength, ease.inOut);
  const headX = lerp(B_START, A_END, head);
  const aLevel = head <= 0 ? 1 : equalOut(head);
  const bLevel = head <= 0 ? 0 : equalIn(head);
  const aTop = A_Y - LANE.h / 2;
  const bTop = B_Y - LANE.h / 2;
  const aLead = linePath([
    [LANE.x0, aTop],
    [B_START, aTop],
  ]);
  const aFade = curve(B_START, A_END, equalOut, aTop);
  const bFade = curve(B_START, A_END, equalIn, bTop);
  const bTail = linePath([
    [A_END, bTop],
    [LANE.x1, bTop],
  ]);
  const aArea = areaPath([[LANE.x0, aTop], [B_START, aTop], ...aFade], aTop + LANE.h);
  const bArea = areaPath([...bFade, [LANE.x1, bTop]], bTop + LANE.h);
  return (
    <div style={{ position: "absolute", left: DECK.x, top: DECK.y - 50, width: DECK.w, height: DECK.h + 50, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - ease.out(rise)) * 120}%)` }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 50,
            width: DECK.w,
            height: DECK.h,
            background: "color-mix(in oklch, var(--background) 97%, transparent)",
            border: "1px solid color-mix(in oklch, var(--foreground) 24%, transparent)",
          }}
        />
        <svg
          aria-hidden
          width={DECK.w}
          height={DECK.h + 50}
          viewBox={`${DECK.x} ${DECK.y - 50} ${DECK.w} ${DECK.h + 50}`}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <defs>
            <pattern id="s5-dots-a" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect x="2" y="2" width="3" height="3" fill="var(--foreground)" fillOpacity="0.5" />
            </pattern>
            <pattern id="s5-dots-b" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect x="2" y="2" width="3" height="3" fill="var(--ignite)" fillOpacity="0.9" />
            </pattern>
            <clipPath id="s5-draw">
              <rect x={LANE.x0 - 4} y={DECK.y - 60} width={(LANE.x1 - LANE.x0 + 8) * draw} height={DECK.h + 60} />
            </clipPath>
          </defs>
          <g clipPath="url(#s5-draw)">
            <path d={aArea} fill="url(#s5-dots-a)" />
            <path d={bArea} fill="url(#s5-dots-b)" />
            <path d={`${aLead} ${linePath(aFade).replace("M", "L")}`} fill="none" stroke="var(--foreground)" strokeWidth="3" />
            <path d={`${linePath(bFade)} ${bTail.replace("M", "L")}`} fill="none" stroke="var(--ignite)" strokeWidth="3" />
          </g>
          <rect
            x={B_START}
            y={aTop - 14}
            width={OVERLAP}
            height={bTop + LANE.h - aTop + 28}
            fill="none"
            stroke="var(--ignite)"
            strokeOpacity={0.45 * draw}
            strokeDasharray="4 6"
          />
          {head > 0 ? <line x1={headX} x2={headX} y1={aTop - 20} y2={bTop + LANE.h + 20} stroke="var(--ignite)" strokeWidth="2.5" /> : null}
        </svg>
        <div
          data-legible=""
          style={{
            position: "absolute",
            left: B_START - DECK.x,
            top: 66,
            width: OVERLAP,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 32,
            color: "var(--ignite)",
          }}
        >
          6 s
        </div>
        <div
          data-legible=""
          style={{
            position: "absolute",
            right: 24,
            top: 66,
            fontFamily: "var(--font-mono)",
            fontSize: 28,
            color: "var(--muted-foreground)",
          }}
        >
          schematic
        </div>
        <div
          style={{
            position: "absolute",
            left: 330 - DECK.x,
            top: aTop - (DECK.y - 50) + (LANE.h - 104) / 2,
            opacity: 0.25 + 0.75 * aLevel,
          }}
        >
          <Patch
            src={plateFile("queue/queue")}
            box={{ x: 220, y: 61, w: 152, h: 152 }}
            at={{ x: 0, y: 0 }}
            scale={104 / 152}
            filter={BRIGHT}
            style={{ position: "relative" }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 330 - DECK.x,
            top: bTop - (DECK.y - 50) + (LANE.h - 104) / 2,
            opacity: 0.35 + 0.65 * bLevel,
          }}
        >
          <DitherCover id="silver-velvet" size={104} color={gold(bLevel)} opacity={0.9} time={frame * 0.01} />
        </div>
      </div>
    </div>
  );
}
