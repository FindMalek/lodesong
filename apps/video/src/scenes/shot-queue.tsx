import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop, cursorAt } from "../design/cursor";
import { Bokeh } from "../design/dof";
import { Bracket } from "../design/draw";
import { ease, ramp } from "../design/motion";
import { Plate, type PlateSlice, plateKeys } from "../design/plate";
import { Whip } from "../design/whip";
import { Chip, grid, KeyStamp, LAYOUT, plateFile, ShotTransit } from "../ui/s4-kit";
import { CrossfadeDeck, CrossfadeSlider } from "../ui/s5-crossfade";
import { BASS_PRESET, CHIPS, EqBands, type PresetChange, TREBLE_PRESET } from "../ui/s5-eq";
import { dragProgress, QueueRows, reorderFrames, slotY } from "../ui/s5-queue-rows";
import { shotOf } from "./timelines";

const SHOT = shotOf("queue");

const Q = { key: 6, panelIn: 16, grab: 36, drop: 78, undoKey: 98, undo: 100, undoEnd: 114 } as const;
const WHIP_1 = 118;
const X = { slider: 8, sliderLength: 24, deck: 30, play: 42, playLength: 24 } as const;
const WHIP_2 = 186;
const E = { bass: 10, treble: 38 } as const;
const WHIP_LENGTH = 8;

const QUEUE_CURSOR: CursorStop[] = [
  { at: grid(12), x: 1400, y: 130 },
  { at: grid(Q.grab), x: 1166, y: 458, click: true },
  { at: grid(Q.drop), x: 1176, y: 298, click: true, dwell: 0.2 },
  { at: grid(Q.drop + 24), x: 1290, y: 470 },
];

const progress = (frame: number): number => {
  const dragged = dragProgress(frame, QUEUE_CURSOR, Q.drop);
  return dragged * (1 - ramp(frame, Q.undo, Q.undoEnd - Q.undo, ease.inOut));
};

const REORDER = reorderFrames(progress, Q.grab, Q.drop);

const EQ_CHANGES: PresetChange[] = [
  { at: E.bass, chip: "bass", bands: BASS_PRESET },
  { at: E.treble, chip: "treble", bands: TREBLE_PRESET },
];

const at2 = (local: number): number => WHIP_1 + local;
const at3 = (local: number): number => WHIP_2 + local;

/** What the score needs from S5, in shot-local frames: panel and keys, a rising tick per row that gives way, undo in reverse, the crossfade swell, the equalizer presets. */
export const S5_CUES: ShotCue[] = [
  { shot: "queue", at: Q.key, kind: "key", label: "q queue" },
  { shot: "queue", at: Q.panelIn, kind: "swell", label: "panel slides in" },
  { shot: "queue", at: Q.grab, kind: "click", label: "grab row" },
  ...REORDER.map((frame, i) => ({ shot: "queue", at: frame, kind: "tick", label: `row ${i + 1} gives way, rising` })),
  { shot: "queue", at: Q.drop, kind: "click", label: "drop row" },
  { shot: "queue", at: Q.undoKey, kind: "key", label: "cmd z undo" },
  { shot: "queue", at: Q.undo, kind: "tick", label: "undo, reverse tick" },
  { shot: "queue", at: WHIP_1, kind: "whoosh", label: "whip to settings" },
  { shot: "queue", at: at2(X.slider), kind: "tick", label: "crossfade slider to 6 s" },
  { shot: "queue", at: at2(X.deck), kind: "swell", label: "crossfade, filtered swell" },
  { shot: "queue", at: at2(X.play), kind: "ping", label: "next song takes the gold" },
  { shot: "queue", at: WHIP_2, kind: "whoosh", label: "whip to equalizer" },
  { shot: "queue", at: at3(E.bass), kind: "key", label: "bass boost" },
  { shot: "queue", at: at3(E.treble), kind: "key", label: "treble boost" },
].sort((a, b) => a.at - b.at);

const SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 765 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 921, h: 765 }, z: 55 },
  { name: "queue", box: { x: 1120, y: 45, w: 320, h: 765 }, z: 110 },
];

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };

const QUEUE_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.04, ry: -7, rx: 1 },
  { at: grid(30), box: { x: 1120, y: 120, w: 320, h: 520 }, scale: 1.5, ry: 4 },
  { at: grid(Q.drop - 14), box: { x: 1060, y: 220, w: 380, h: 300 }, scale: 1.8, ry: 2 },
  { at: grid(Q.undoEnd), box: { x: 1060, y: 200, w: 380, h: 340 }, scale: 1.7, ry: -2 },
]);

function QueueScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, QUEUE_KEYS), handheld(frame, 0.7));
  const pointer = cursorAt(frame, QUEUE_CURSOR);
  const p = progress(frame);
  const lift =
    ramp(frame, Q.grab, 6) * (1 - ramp(frame, Q.drop + 2, 8)) + 0.45 * ramp(frame, Q.undo, 4) * (1 - ramp(frame, Q.undoEnd - 4, 6));
  const slide = ramp(frame, Q.panelIn - 10, 12, ease.out);
  const cursorOpacity = ramp(frame, 14, 6) * (1 - ramp(frame, Q.drop + 14, 8, ease.in));
  return (
    <Camera cam={cam}>
      <Plate
        src={plateFile("queue/queue")}
        layout={LAYOUT}
        slices={SLICES}
        focusZ={110}
        aperture={0.012}
        light={{ x: pointer.x, y: pointer.y, radius: 520, dim: 0.58, wash: 0.05 }}
      >
        <div
          style={{
            position: "absolute",
            left: 1119,
            top: 44,
            width: 321,
            height: 701,
            background: "rgb(24 24 24)",
            transform: `translateX(${(1 - slide) * 321}px)`,
            opacity: slide < 1 ? 1 : 0,
          }}
        />
        <QueueRows p={p} lift={lift} />
        <Bracket box={{ x: 1126, y: slotY(1), w: 308, h: 40 }} at={grid(Q.drop + 2)} pad={4} arm={10} width={2} length={0.4} />
        <div style={{ opacity: cursorOpacity }}>
          <Cursor stops={QUEUE_CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
        </div>
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={5} opacity={0.1} />
    </Camera>
  );
}

const SETTINGS_SLICE: PlateSlice[] = [{ name: "dialog", box: { x: 336, y: 84, w: 752, h: 640 }, z: 60 }];

const X_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.06, ry: 5, rx: 0.5 },
  { at: grid(X.slider + 6), box: { x: 760, y: 200, w: 380, h: 140 }, scale: 1.75, ry: -2 },
  { at: grid(X.deck + 8), box: { x: 560, y: 130, w: 640, h: 300 }, scale: 1.3, ry: -1 },
  { at: grid(X.play + X.playLength), box: { x: 560, y: 120, w: 640, h: 300 }, scale: 1.24, ry: 1 },
]);

function CrossfadeScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, X_KEYS), handheld(frame, 0.6));
  return (
    <>
      <Camera cam={cam}>
        <Plate
          src={plateFile("crossfade/off")}
          layout={LAYOUT}
          slices={SETTINGS_SLICE}
          focusZ={60}
          aperture={0.014}
          light={{ x: 960, y: 270, radius: 560, dim: 0.5, wash: 0.05 }}
        >
          <CrossfadeSlider from={X.slider} length={X.sliderLength} />
          <Bracket box={{ x: 756, y: 232, w: 340, h: 76 }} at={grid(X.slider + X.sliderLength)} pad={4} arm={12} width={2} length={0.4} />
        </Plate>
        <Bokeh focusZ={0} z={300} count={5} seed={11} opacity={0.1} />
      </Camera>
      <CrossfadeDeck from={X.deck} play={X.play} playLength={X.playLength} />
    </>
  );
}

const EQ_SLICE: PlateSlice[] = [{ name: "equalizer", box: { x: 1056, y: 0, w: 384, h: 810 }, z: 110 }];

const E_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.05, ry: -6, rx: 0 },
  { at: grid(8), box: { x: 1056, y: 100, w: 384, h: 340 }, scale: 1.75, ry: -3 },
  { at: grid(60), box: { x: 1056, y: 120, w: 384, h: 330 }, scale: 1.65, ry: 1 },
]);

const EQ_CURSOR: CursorStop[] = [
  { at: grid(0), x: 1420, y: 330 },
  { at: grid(E.bass), x: 1172, y: 142, click: true, dwell: 0.2 },
  { at: grid(E.treble), x: 1272, y: 142, click: true, dwell: 0.2 },
  { at: grid(E.treble + 18), x: 1250, y: 330 },
];

function EqScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, E_KEYS), handheld(frame, 0.6));
  const chip = frame < E.treble ? CHIPS.bass : CHIPS.treble;
  return (
    <Camera cam={cam}>
      <Plate
        src={plateFile("equalizer/eq")}
        layout={LAYOUT}
        slices={EQ_SLICE}
        focusZ={110}
        aperture={0.012}
        light={{ x: 1250, y: 260, radius: 520, dim: 0.5, wash: 0.05 }}
      >
        <EqBands changes={EQ_CHANGES} />
        {chip ? <Bracket box={chip} at={grid(frame < E.treble ? E.bass : E.treble)} pad={4} arm={8} width={2} length={0.3} /> : null}
        <Cursor stops={EQ_CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={2} opacity={0.1} />
    </Camera>
  );
}

function Segments() {
  return (
    <Whip
      at={WHIP_1}
      length={WHIP_LENGTH}
      direction="left"
      from={<QueueScene />}
      to={
        <Sequence layout="none" from={WHIP_1}>
          <Whip
            at={WHIP_2 - WHIP_1}
            length={WHIP_LENGTH}
            direction="left"
            from={<CrossfadeScene />}
            to={
              <Sequence layout="none" from={WHIP_2 - WHIP_1}>
                <EqScene />
              </Sequence>
            }
          />
        </Sequence>
      }
    />
  );
}

/** S5, the queue: `q` slides the panel in, a row is dragged up over its neighbours and `⌘Z` puts it back, the crossfade slider goes to 6 s and the two songs overlap with no gap, a preset reshapes the ten bands. */
export function QueueShot() {
  const frame = useCurrentFrame();
  const lit = frame < WHIP_1 ? 0 : frame < WHIP_2 ? 1 : 2;
  return (
    <ShotTransit frames={SHOT.frames} leave={null} arrive="right">
      <Segments />
      <KeyStamp label="q" at={Q.key} />
      <KeyStamp label="⌘Z" at={Q.undoKey} wide hold={14} />
      <Chip text="queue  crossfade  eq" from={Q.key + 10} x={96} y={960} lit={lit} />
    </ShotTransit>
  );
}
