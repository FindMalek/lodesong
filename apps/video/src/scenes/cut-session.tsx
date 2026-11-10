import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { Bracket, ConnectLine, connectPoint } from "../design/draw";
import { Halation } from "../design/halation";
import { ease, lerp, ramp } from "../design/motion";
import { filmPlate } from "../ui/s8-real-crop";
import { CutChip, driftCam, g, Hit, PlateWindow } from "./cut-kit";
import { cutOf } from "./timelines";

const SHOT = cutOf("session");
const LINE_AT = 6;
const FLIGHT_AT = 24;
const FLIGHT_FRAMES = 34;
const ARRIVE = FLIGHT_AT + FLIGHT_FRAMES;
const CHIP_AT = 8;

const LAPTOP_BOX = { x: 200, y: 50, w: 560, h: 165 };
const LAPTOP = { x: 90, y: 268, width: 900 };
const LAPTOP_K = LAPTOP.width / LAPTOP_BOX.w;
const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };

const PHONE_PLATE = { w: 390, h: 844 };
const PHONE = { x: 319, y: 642, width: 442 };
const PHONE_K = PHONE.width / PHONE_PLATE.w;
const BAR = { x: 0, y: 771, w: 390, h: 73 };

const FROM = {
  x: LAPTOP.x + (COVER_BOX.x + COVER_BOX.w / 2 - LAPTOP_BOX.x) * LAPTOP_K,
  y: LAPTOP.y + (COVER_BOX.y + COVER_BOX.h / 2 - LAPTOP_BOX.y) * LAPTOP_K,
};
const TO = { x: PHONE.x + 32.5 * PHONE_K, y: PHONE.y + 799 * PHONE_K };
const SIZE_FROM = COVER_BOX.w * LAPTOP_K;
const SIZE_TO = 42 * PHONE_K;
const BEND = 0.45;
const HAIRLINE = "2px solid color-mix(in oklch, var(--foreground) 34%, transparent)";

export const CUT_SESSION_CUES: readonly ShotCue[] = [
  { shot: "session", at: LINE_AT, kind: "tick", label: "gold line draws between the devices" },
  { shot: "session", at: CHIP_AT + 6, kind: "tick", label: "chip settles" },
  { shot: "session", at: ARRIVE + 4, kind: "ping", label: "bar ignites on the phone" },
];

function Flight({ frame }: { frame: number }) {
  const t = ramp(frame, FLIGHT_AT, FLIGHT_FRAMES, ease.inOut);
  if (t <= 0 || t >= 1) return null;
  const at = connectPoint(FROM, TO, t, BEND, true);
  const base = lerp(SIZE_FROM, SIZE_TO, t);
  const size = base + 120 * Math.sin(Math.PI * t) ** 1.4;
  return (
    <div style={{ position: "absolute", left: at.x - size / 2, top: at.y - size / 2, width: size, height: size }}>
      <Halation fill strength={0.55} radius={30}>
        <PlateWindow src={filmPlate("devices/handed-off")} box={COVER_BOX} x={0} y={0} width={size} filter="brightness(1.4)" />
      </Halation>
    </div>
  );
}

function Landing({ frame }: { frame: number }) {
  const t = ramp(frame, ARRIVE, 22);
  if (t <= 0 || t >= 1) return null;
  const r = lerp(40, 190, t);
  return (
    <i
      style={{
        position: "absolute",
        left: TO.x - r,
        top: TO.y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${lerp(7, 1, t)}px solid var(--ignite)`,
        opacity: (1 - t) ** 1.5,
      }}
    />
  );
}

/** Cut 4: the desktop's playing cover rides a gold line down onto the phone's web player, which takes the queue over. */
export function SessionScene() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, SHOT.frames, { scale: { from: 1.02, to: 1 }, y: { from: -14, to: 0 }, ry: { from: -3, to: 2 } });
  const arrived = frame >= ARRIVE;
  const phoneLift = ramp(frame, 0, 10);
  return (
    <>
      <Camera cam={cam}>
        <Layer z={40}>
          <PlateWindow
            src={filmPlate("devices/handed-off")}
            box={LAPTOP_BOX}
            {...LAPTOP}
            filter="brightness(1.5)"
            style={{ border: HAIRLINE, boxSizing: "content-box", marginLeft: -2, marginTop: -2 }}
          />
        </Layer>
        <Layer z={-30}>
          <PlateWindow
            src={filmPlate(arrived ? "devices/phone-after" : "devices/phone-before")}
            plate={PHONE_PLATE}
            box={{ x: 0, y: 0, ...PHONE_PLATE }}
            {...PHONE}
            filter={`brightness(${lerp(1.2, 1.5, phoneLift)})`}
            style={{ border: HAIRLINE, boxSizing: "content-box", marginLeft: -2, marginTop: -2 }}
          >
            {arrived ? <Bracket box={BAR} at={g(ARRIVE + 2)} pad={0} arm={36} width={3.5} length={0.5} /> : null}
          </PlateWindow>
        </Layer>
        <Layer z={60}>
          <ConnectLine
            from={FROM}
            to={TO}
            at={g(LINE_AT)}
            length={0.9}
            bend={BEND}
            vertical
            width={6}
            size={{ w: 1080, h: 1920 }}
            pulse={{ at: g(FLIGHT_AT - 6), length: 0.9 }}
          />
          <Flight frame={frame} />
          <Landing frame={frame} />
        </Layer>
        <Bokeh focusZ={0} z={300} count={8} seed={9} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <CutChip text="one session" from={CHIP_AT} y={538} />
      <Hit at={ARRIVE} strength={0.14} />
    </>
  );
}
