import type { ReactNode } from "react";
import { Img, Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop, cursorAt } from "../design/cursor";
import { Bracket } from "../design/draw";
import { ease, hash, ramp } from "../design/motion";
import { Plate, plateKeys, plateLayout } from "../design/plate";
import { Chip } from "../ui/s7-chip";
import { filmPlate as film } from "../ui/s8-real-crop";
import { shotOf } from "./timelines";

const SHOT = shotOf("mood");
const PLATE = { w: 1440, h: 810 };
const LAYOUT = plateLayout(PLATE);
const LIFT = 1.3;
const FULL = { x: 0, y: 0, ...PLATE };
const g = (frame: number): number => frame / 30;

const PROMPT = "late night drive, 90s, no vocals";
const TYPE_FROM = 4;
const TYPE_STEP = 1.3;
const LANDINGS = [...PROMPT].map((_, i) => TYPE_FROM + Math.floor(i * TYPE_STEP + hash(i * 3.1) * 1.1));
const TYPED_END = (LANDINGS.at(-1) ?? 0) + 2;

const MAKE_AT = SHOT.beat(2);
const CREATE_AT = SHOT.beat(3.8);
const STATS_AT = SHOT.beat(5.3);
const RECAP_AT = STATS_AT + 32;
const RECAP_BUTTON = { x: 1349, y: 51, w: 71, h: 28 };

const FIELD = { x: 513, y: 296, w: 322, h: 28 };
const TEXT_FROM = 523.3;
const TEXT_WIDTH = 161.7;
const MAKE_IT = { x: 885, y: 310 };
const CREATE = { x: 900, y: 578 };

/** What the score hangs on, in shot-local frames: every typed key, both clicks, the list landing, the palette. */
export const S7_CUES: readonly ShotCue[] = [
  ...LANDINGS.map((at): ShotCue => ({ shot: "mood", at, kind: "typed", label: "prompt key" })),
  { shot: "mood", at: MAKE_AT, kind: "click", label: "make it" },
  { shot: "mood", at: MAKE_AT, kind: "ping", label: "playlist drafted" },
  { shot: "mood", at: CREATE_AT, kind: "click", label: "create" },
  { shot: "mood", at: CREATE_AT, kind: "ping", label: "list lands" },
  { shot: "mood", at: STATS_AT, kind: "ping", label: "stats page" },
  { shot: "mood", at: RECAP_AT, kind: "click", label: "recap" },
  { shot: "mood", at: RECAP_AT, kind: "swell", label: "recap card" },
];

interface StageProps {
  cam: ReturnType<typeof camAt>;
  children: ReactNode;
}

function Rig({ cam, children }: StageProps) {
  const frame = useCurrentFrame();
  return <Camera cam={addCam(cam, handheld(frame, 0.7))}>{children}</Camera>;
}

const pointerSize = (scale: number): number => 38 / (LAYOUT.k * scale);

/** The prompt, typed into the real dialog: the glyphs are the capture's own, revealed key by key behind a caret. */
function TypedReveal({ frame }: { frame: number }) {
  const n = LANDINGS.filter((at) => frame >= at).length;
  const edge = n === 0 ? TEXT_FROM : TEXT_FROM + (TEXT_WIDTH * n) / PROMPT.length;
  const typing = frame < TYPED_END;
  return (
    <div style={{ position: "absolute", inset: 0, filter: `brightness(${LIFT})` }}>
      <div style={{ position: "absolute", left: FIELD.x, top: FIELD.y, width: FIELD.w, height: FIELD.h, background: "rgb(28 28 28)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(${FIELD.y}px ${PLATE.w - edge - 1}px ${PLATE.h - FIELD.y - FIELD.h}px ${FIELD.x}px)`,
        }}
      >
        <Img src={film("ai-prompt/typed")} style={{ width: PLATE.w, height: PLATE.h }} />
      </div>
      {typing ? (
        <div style={{ position: "absolute", left: edge + 1, top: FIELD.y + 6, width: 1.6, height: 16, background: "var(--foreground)" }} />
      ) : null}
    </div>
  );
}

const CURSOR_A: CursorStop[] = [
  { at: g(0), x: 1010, y: 470 },
  { at: g(MAKE_AT), ...MAKE_IT, click: true },
];

function Disclaimer() {
  return (
    <div style={{ position: "absolute", inset: 0, filter: `brightness(${LIFT * 1.7})` }}>
      <div style={{ position: "absolute", left: 510, top: 331, width: 310, height: 20, background: "rgb(25 25 25)" }} />
      <div
        style={{
          position: "absolute",
          left: 512,
          top: 333,
          fontFamily: "var(--font-sans)",
          fontSize: 13.5,
          lineHeight: "16px",
          color: "rgb(67 67 67)",
          whiteSpace: "nowrap",
        }}
      >
        only songs you own
      </div>
    </div>
  );
}

function Prompt() {
  const frame = useCurrentFrame();
  const typed = frame >= TYPED_END;
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: FULL, scale: 1.12, ry: -5, rx: 1.2 },
      { at: g(28), box: { x: 496, y: 292, w: 448, h: 140 }, scale: 2.3, ry: -1.5, rx: 0 },
      { at: g(MAKE_AT), box: { x: 560, y: 292, w: 448, h: 140 }, scale: 2.5, ry: 2, rx: 0 },
    ]),
  );
  return (
    <Rig cam={cam}>
      <Plate
        src={film(typed ? "ai-prompt/typed" : "ai-prompt/dialog")}
        layout={LAYOUT}
        brightness={LIFT}
        light={{ x: 690, y: 330, radius: 640, dim: 0.72, wash: 0 }}
      >
        {typed ? null : <TypedReveal frame={frame} />}
        <Disclaimer />
        <Bracket box={FIELD} at={g(3)} pad={5} arm={14} width={2.5} length={0.5} />
        <Cursor stops={CURSOR_A} size={pointerSize(cam.scale)} />
      </Plate>
    </Rig>
  );
}

const CURSOR_B: CursorStop[] = [
  { at: g(0), ...MAKE_IT, click: true },
  { at: g(CREATE_AT - MAKE_AT), ...CREATE, click: true },
];

function Made() {
  const frame = useCurrentFrame();
  const span = CREATE_AT - MAKE_AT;
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: { x: 560, y: 292, w: 448, h: 140 }, scale: 2.5, ry: 2 },
      { at: g(span), box: { x: 496, y: 360, w: 448, h: 220 }, scale: 2.1, ry: -2 },
    ]),
  );
  return (
    <Rig cam={cam}>
      <Plate src={film("ai-prompt/made")} layout={LAYOUT} brightness={LIFT} light={{ x: 700, y: 400, radius: 680, dim: 0.74, wash: 0 }}>
        <Bracket box={{ x: 513, y: 333, w: 322, h: 16 }} at={g(8)} pad={6} arm={12} width={2.5} length={0.5} />
        <Bracket box={{ x: 513, y: 383, w: 322, h: 30 }} at={g(30)} pad={5} arm={14} width={2.5} length={0.5} />
        <Cursor stops={CURSOR_B} size={pointerSize(cam.scale)} />
      </Plate>
    </Rig>
  );
}

function Landed() {
  const frame = useCurrentFrame();
  const reveal = ramp(frame, 0, 10, ease.out);
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: FULL, scale: 1.02, ry: 2 },
      { at: g(10), box: { x: 219, y: 60, w: 820, h: 260 }, scale: 1.7, ry: -2 },
      { at: g(34), box: { x: 219, y: 60, w: 820, h: 260 }, scale: 1.75, ry: -1 },
      { at: g(STATS_AT - CREATE_AT), box: { x: 0, y: 640, w: 420, h: 170 }, scale: 2.2, ry: 3 },
    ]),
    ease.out,
  );
  return (
    <Rig cam={cam}>
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}>
        <Plate
          src={film("ai-prompt/playlist")}
          layout={LAYOUT}
          brightness={LIFT}
          light={{ x: 560, y: 200, radius: 760, dim: 0.78, wash: 0 }}
        >
          <Bracket box={{ x: 8, y: 734, w: 183, h: 27 }} at={g(36)} pad={5} arm={12} width={2.5} length={0.4} />
        </Plate>
      </div>
      {reveal < 1 ? (
        <div
          style={{
            position: "absolute",
            left: LAYOUT.left,
            top: LAYOUT.top + reveal * PLATE.h * LAYOUT.k,
            width: PLATE.w * LAYOUT.k,
            height: 4,
            background: "var(--ignite)",
            boxShadow: "0 0 26px 6px var(--ignite)",
          }}
        />
      ) : null}
    </Rig>
  );
}

const CURSOR_STATS: CursorStop[] = [
  { at: g(0), x: 760, y: 330 },
  { at: g(RECAP_AT - STATS_AT), x: RECAP_BUTTON.x + 36, y: RECAP_BUTTON.y + 14, click: true },
];

function Stats() {
  const frame = useCurrentFrame();
  const span = RECAP_AT - STATS_AT;
  const pointer = cursorAt(frame, CURSOR_STATS);
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: { x: 220, y: 120, w: 560, h: 150 }, scale: 1.9, ry: -2 },
      { at: g(span), box: { x: 1120, y: 30, w: 320, h: 90 }, scale: 2.2, ry: 2 },
    ]),
  );
  return (
    <Rig cam={cam}>
      <Plate
        src={film("stats/stats")}
        layout={LAYOUT}
        brightness={LIFT}
        light={{ x: pointer.x, y: pointer.y, radius: 620, dim: 0.74, wash: 0 }}
      >
        <Bracket box={{ x: 220, y: 150, w: 193, h: 90 }} at={g(2)} pad={5} arm={14} width={2.5} length={0.4} />
        <Bracket box={RECAP_BUTTON} at={g(span - 12)} pad={8} arm={12} width={2.5} length={0.4} />
        <Cursor stops={CURSOR_STATS} size={pointerSize(cam.scale)} />
      </Plate>
    </Rig>
  );
}

function Recap() {
  const frame = useCurrentFrame();
  const span = SHOT.frames - RECAP_AT;
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: { x: 480, y: 16, w: 480, h: 778 }, scale: 1.15, ry: -3 },
      { at: g(span), box: { x: 495, y: 590, w: 450, h: 160 }, scale: 2.3, ry: 2 },
    ]),
  );
  return (
    <Rig cam={cam}>
      <Plate src={film("recap/recap")} layout={LAYOUT} brightness={LIFT} light={{ x: 720, y: 640, radius: 560, dim: 0.76, wash: 0 }}>
        <Bracket box={{ x: 504, y: 650, w: 150, h: 36 }} at={g(8)} pad={6} arm={14} width={2.5} length={0.4} />
      </Plate>
    </Rig>
  );
}

/** S7: one sentence becomes a playlist (typed prompt, make it, create, the list lands), the stats page opens the recap. */
export function MoodShot() {
  return (
    <>
      <Sequence layout="none" from={0} durationInFrames={MAKE_AT}>
        <Prompt />
      </Sequence>
      <Sequence layout="none" from={MAKE_AT} durationInFrames={CREATE_AT - MAKE_AT}>
        <Made />
      </Sequence>
      <Sequence layout="none" from={CREATE_AT} durationInFrames={STATS_AT - CREATE_AT}>
        <Landed />
      </Sequence>
      <Sequence layout="none" from={STATS_AT} durationInFrames={RECAP_AT - STATS_AT}>
        <Stats />
      </Sequence>
      <Sequence layout="none" from={RECAP_AT} durationInFrames={SHOT.frames - RECAP_AT}>
        <Recap />
      </Sequence>
      <Sequence layout="none" durationInFrames={STATS_AT}>
        <Chip text="ask for a mood" from={6} style={{ right: 70, bottom: 56 }} />
      </Sequence>
      <Sequence layout="none" from={STATS_AT}>
        <Chip text="recap" from={0} style={{ right: 70, bottom: 56 }} />
      </Sequence>
    </>
  );
}
