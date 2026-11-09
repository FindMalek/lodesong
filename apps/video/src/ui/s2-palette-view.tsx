import { useCurrentFrame } from "remotion";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, cursorAt } from "../design/cursor";
import { Bracket, ConnectLine } from "../design/draw";
import { ease, lerp, ramp } from "../design/motion";
import { Plate } from "../design/plate";
import { typedCount } from "../design/typing";
import {
  BRACKET_AT,
  CARET,
  CLICK_AT,
  CURSOR_STOPS,
  KEY_AT,
  LANDINGS,
  MARK,
  OPEN_AT,
  PLATE,
  plateAt,
  RESULTS_AT,
  ROW_STEP,
  ROW1,
  S2_KEYS,
  underlineAt,
} from "../scenes/s2-palette";

const SEARCH_FIELD = { x: 830, y: 22 };

const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

/** The captured palette as a camera subject: real stills stepped with the keystrokes, a pool of light on the caret and then the cursor, marks underlined where the lyric matched. Time is the shot's frame, so S3 can continue it. */
export function PaletteView() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, S2_KEYS), handheld(frame, 0.7));
  const typed = typedCount(frame, LANDINGS);
  const pointer = cursorAt(frame, CURSOR_STOPS);
  const toCaret = mix(SEARCH_FIELD, CARET(typed), ramp(frame, KEY_AT, 14, ease.inOut));
  const pool = mix(toCaret, pointer, ramp(frame, RESULTS_AT, 14, ease.inOut));
  const open = ramp(frame, KEY_AT, 22, ease.inOut);
  const settled = frame >= RESULTS_AT;
  const select = ramp(frame, RESULTS_AT + 34, 12);
  const clicked = frame >= CLICK_AT;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Camera cam={cam}>
        <Plate
          src={plateAt(frame)}
          layout={PLATE}
          brightness={1.7}
          light={{ x: pool.x, y: pool.y, radius: lerp(1500, 700, open), dim: lerp(0.9, 0.68, open), wash: 0.03 }}
        >
          {settled ? (
            <div
              style={{
                position: "absolute",
                left: ROW1.x,
                top: ROW1.y,
                width: ROW1.w * select,
                height: ROW1.h,
                background: `color-mix(in oklch, var(--ignite) ${clicked ? 14 : 6}%, transparent)`,
                borderLeft: "3px solid var(--ignite)",
                overflow: "hidden",
              }}
            />
          ) : null}
          {settled
            ? [0, 1, 2].map((row) => {
                const y = MARK.y + row * ROW_STEP;
                return (
                  <ConnectLine
                    key={row}
                    from={{ x: MARK.x, y }}
                    to={{ x: MARK.x + MARK.w, y }}
                    at={underlineAt(row) / 30}
                    length={0.4}
                    bend={0}
                    width={row === 0 ? 2.6 : 1.8}
                  />
                );
              })
            : null}
          {settled ? (
            <Bracket box={{ x: MARK.x, y: MARK.y - 18, w: MARK.w, h: 15 }} at={BRACKET_AT / 30} length={0.45} pad={3} arm={6} width={2} />
          ) : null}
          {frame > OPEN_AT && !settled ? (
            <i
              style={{
                position: "absolute",
                left: CARET(typed).x + 1,
                top: CARET(typed).y - 11,
                width: 2,
                height: 22,
                background: "var(--ignite)",
                opacity: Math.floor(frame / 8) % 4 === 3 ? 0 : 1,
              }}
            />
          ) : null}
          {frame >= RESULTS_AT + 4 ? <Cursor stops={CURSOR_STOPS} size={46 / (PLATE.k * cam.scale)} /> : null}
        </Plate>
      </Camera>
    </div>
  );
}
