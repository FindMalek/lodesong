import { type CursorStop, cursorAt } from "../design/cursor";
import { ease, lerp, ramp } from "../design/motion";
import { BRIGHT, flat, LIFT, Patch, plateFile } from "./s4-kit";

const SLOT0 = 237.4;
const ROW = 40;
const PANEL_X = 1126;
const ROW_W = 308;
const FROM = 5;
const TO = 1;

const QUEUE = plateFile("queue/queue");
const FLAT = flat(16);

export const slotY = (slot: number): number => SLOT0 + ROW * slot;

export function dragProgress(frame: number, stops: readonly CursorStop[], until: number): number {
  const { y } = cursorAt(Math.min(frame, until), stops);
  const from = slotY(FROM) + ROW / 2;
  const to = slotY(TO) + ROW / 2;
  return Math.min(1, Math.max(0, (from - y) / (from - to)));
}

const shiftOf = (dragTop: number, row: number): number => ramp(slotY(row) + 34 - dragTop, 0, 28, ease.out);

export function reorderFrames(progressAt: (frame: number) => number, from: number, to: number): number[] {
  const hit: number[] = [];
  for (let row = TO; row < FROM; row += 1) {
    for (let frame = from; frame <= to; frame += 1) {
      if (shiftOf(slotY(FROM - (FROM - TO) * progressAt(frame)), row) > 0.5) {
        hit.push(frame);
        break;
      }
    }
  }
  return hit;
}

interface QueueRowsProps {
  p: number;
  lift: number;
}

/** The queue panel's rows moved with crops of the real capture: five rows are cut out and re-seated while one is dragged over them, so the reorder is the app's own pixels in motion. */
export function QueueRows({ p, lift }: QueueRowsProps) {
  const dragTop = lerp(slotY(FROM), slotY(TO), p);
  const rows = [1, 2, 3, 4];
  return (
    <>
      <div style={{ position: "absolute", left: 1121, top: slotY(TO), width: 319, height: ROW * 5, background: FLAT }} />
      {rows.map((row) => (
        <Patch
          key={row}
          src={QUEUE}
          box={{ x: PANEL_X, y: slotY(row), w: ROW_W, h: ROW }}
          at={{ x: PANEL_X, y: slotY(row) + ROW * shiftOf(dragTop, row) }}
          filter={BRIGHT}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: PANEL_X - 6 * lift,
          top: dragTop - 1 * lift,
          width: ROW_W + 12 * lift,
          height: ROW + 2 * lift,
          transform: `scale(${1 + 0.04 * lift})`,
          outline: lift > 0 ? `${1.5 * lift}px solid var(--ignite)` : undefined,
          background: lift > 0 ? "rgb(40 40 40)" : undefined,
        }}
      >
        <Patch
          src={QUEUE}
          box={{ x: PANEL_X, y: slotY(FROM), w: ROW_W, h: ROW }}
          at={{ x: 6 * lift, y: lift }}
          filter={`brightness(${LIFT + 0.35 * lift})`}
        />
      </div>
    </>
  );
}
