import type { ReactNode } from "react";
import { Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bracket } from "../design/draw";
import { ease, hash, ramp } from "../design/motion";
import { Plate, plateKeys, plateLayout } from "../design/plate";
import { Keycap, pressAt } from "../ui/keycap";
import { Chip } from "../ui/s7-chip";
import { shotOf } from "./timelines";

const SHOT = shotOf("mood");
const PLATE = { w: 1440, h: 810 };
const LAYOUT = plateLayout(PLATE);
const LIFT = 1.3;
const FULL = { x: 0, y: 0, ...PLATE };
const g = (frame: number): number => frame / 30;
const film = (name: string): string => staticFile(`film/${name}.png`);

const PROMPT = "late night drive, 90s, no vocals";
const TYPE_FROM = 6;
const TYPE_STEP = 1.68;
const LANDINGS = [...PROMPT].map((_, i) => TYPE_FROM + Math.floor(i * TYPE_STEP + hash(i * 3.1) * 1.4));
const TYPED_END = (LANDINGS.at(-1) ?? 0) + 2;

const MAKE_AT = SHOT.beat(3);
const CREATE_AT = SHOT.beat(5);
const GYM_AT = SHOT.beat(6);
const GYM_TYPED = [0, 5, 10];
const GYM_RESULT = 16;

const FIELD = { x: 513, y: 296, w: 322, h: 28 };
const TEXT_FROM = 523.3;
const TEXT_WIDTH = 161.7;
const MAKE_IT = { x: 885, y: 310 };
const CREATE = { x: 900, y: 578 };
const GYM_ROW = { x: 388, y: 215, w: 672, h: 42 };
const ROW_HIT = { x: 700, y: 236 };

/** What the score hangs on, in shot-local frames: every typed key, both clicks, the list landing, the palette. */
export const S7_CUES: readonly ShotCue[] = [
  ...LANDINGS.map((at): ShotCue => ({ shot: "mood", at, kind: "typed", label: "prompt key" })),
  { shot: "mood", at: MAKE_AT, kind: "click", label: "make it" },
  { shot: "mood", at: MAKE_AT, kind: "ping", label: "playlist drafted" },
  { shot: "mood", at: CREATE_AT, kind: "click", label: "create" },
  { shot: "mood", at: CREATE_AT, kind: "ping", label: "list lands" },
  { shot: "mood", at: GYM_AT, kind: "key", label: "cmd k" },
  ...GYM_TYPED.map((at): ShotCue => ({ shot: "mood", at: GYM_AT + at, kind: "typed", label: "gym key" })),
  { shot: "mood", at: GYM_AT + GYM_RESULT, kind: "ping", label: "mood result" },
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

function Prompt() {
  const frame = useCurrentFrame();
  const typed = frame >= TYPED_END;
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: FULL, scale: 1.12, ry: -5, rx: 1.2 },
      { at: g(34), box: { x: 496, y: 292, w: 448, h: 140 }, scale: 2.3, ry: -1.5, rx: 0 },
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
        <Bracket box={{ x: 513, y: 333, w: 322, h: 16 }} at={g(5)} pad={6} arm={12} width={2.5} length={0.5} />
        <Bracket box={{ x: 513, y: 383, w: 322, h: 30 }} at={g(16)} pad={5} arm={14} width={2.5} length={0.5} />
        <Cursor stops={CURSOR_B} size={pointerSize(cam.scale)} />
      </Plate>
    </Rig>
  );
}

function Landed() {
  const frame = useCurrentFrame();
  const reveal = ramp(frame, 0, 15, ease.out);
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: FULL, scale: 1.02, ry: 2 },
      { at: g(12), box: { x: 219, y: 60, w: 820, h: 260 }, scale: 1.7, ry: -2 },
      { at: g(GYM_AT - CREATE_AT), box: { x: 219, y: 120, w: 820, h: 330 }, scale: 1.8, ry: -3 },
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
        />
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

const [GYM_Y, GYM_M] = [GYM_TYPED[1] ?? 5, GYM_TYPED[2] ?? 10];

function plateOfGym(frame: number): string {
  if (frame < GYM_Y) return "mood-search/type-01";
  if (frame < GYM_M) return "mood-search/type-02";
  if (frame < GYM_RESULT) return "mood-search/type-03";
  return "mood-search/results";
}

function Gym() {
  const frame = useCurrentFrame();
  const span = SHOT.frames - GYM_AT;
  const cam = camAt(
    frame,
    plateKeys(LAYOUT, [
      { at: g(0), box: { x: 380, y: 149, w: 680, h: 512 }, scale: 1.55, ry: 3 },
      { at: g(span), box: { x: 404, y: 200, w: 640, h: 120 }, scale: 2.25, ry: -2 },
    ]),
  );
  const strike = pressAt(frame, 0, 3, 6);
  return (
    <>
      <Rig cam={cam}>
        <Plate
          src={film(plateOfGym(frame))}
          layout={LAYOUT}
          brightness={LIFT}
          light={{ x: ROW_HIT.x, y: ROW_HIT.y + 20, radius: 700, dim: 0.74, wash: 0 }}
        >
          <Bracket box={GYM_ROW} at={g(GYM_RESULT + 2)} pad={4} arm={16} width={2.5} length={0.5} />
        </Plate>
      </Rig>
      {frame < 40 ? (
        <div style={{ position: "absolute", right: 90, bottom: 110, display: "flex", gap: 14, opacity: 1 - ramp(frame, 24, 12) }}>
          <Keycap label="⌘" size={84} press={strike} legible />
          <Keycap label="k" size={84} press={strike} legible />
        </div>
      ) : null}
    </>
  );
}

/** S7: one sentence becomes a playlist (typed prompt, make it, create, the list lands), then a single word finds a mood in cmd-k. */
export function MoodShot() {
  return (
    <>
      <Sequence layout="none" from={0} durationInFrames={MAKE_AT}>
        <Prompt />
      </Sequence>
      <Sequence layout="none" from={MAKE_AT} durationInFrames={CREATE_AT - MAKE_AT}>
        <Made />
      </Sequence>
      <Sequence layout="none" from={CREATE_AT} durationInFrames={GYM_AT - CREATE_AT}>
        <Landed />
      </Sequence>
      <Sequence layout="none" from={GYM_AT} durationInFrames={SHOT.frames - GYM_AT}>
        <Gym />
      </Sequence>
      <Chip text="ask for a mood" from={8} style={{ left: 70, top: 950 }} />
    </>
  );
}
