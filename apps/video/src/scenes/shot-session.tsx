import { Img, Sequence, useCurrentFrame } from "remotion";
import { plateBox } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, camTo, handheld, Layer } from "../design/camera";
import { Cursor, type CursorStop, cursorAt } from "../design/cursor";
import { DeviceFrame } from "../design/device-frame";
import { Bokeh } from "../design/dof";
import { Bracket, ConnectLine, connectPoint } from "../design/draw";
import { Halation } from "../design/halation";
import { ease, lerp, ramp } from "../design/motion";
import { Plate, plateKeys, plateLayout } from "../design/plate";
import { Whip } from "../design/whip";
import { Chip } from "../ui/s7-chip";
import { filmPlate as film, RealCrop } from "../ui/s8-real-crop";
import { shotOf } from "./timelines";

const SHOT = shotOf("session");
const PLATE = { w: 1440, h: 810 };
const LAYOUT = plateLayout(PLATE);
const FULL = { x: 0, y: 0, ...PLATE };
const g = (frame: number): number => frame / 30;

const OPEN_PICKER = 34;
const PICK_PHONE = 66;
const WHIP_AT = 72;
const WHIP_LENGTH = 10;
const LISTEN_AT = SHOT.beat(10);
const START_SESSION = { x: 220, y: 251, w: 100, h: 26 };

const LINE_AT = 6;
const FLIGHT_FROM = 40;
const FLIGHT_LENGTH = 58;
const ARRIVE = FLIGHT_FROM + FLIGHT_LENGTH;
const CHIPS_FROM = ARRIVE + 6;
const CHIP_STEP = 7;
const CLIENTS = ["web", "macos", "ios", "android", "desktop", "arpeggi"] as const;

export const S8_CUES: readonly ShotCue[] = [
  { shot: "session", at: OPEN_PICKER, kind: "click", label: "devices" },
  { shot: "session", at: OPEN_PICKER, kind: "ping", label: "picker opens" },
  { shot: "session", at: PICK_PHONE, kind: "click", label: "play on iphone" },
  { shot: "session", at: WHIP_AT, kind: "whoosh", label: "whip to the two devices" },
  { shot: "session", at: WHIP_AT + LINE_AT, kind: "riser", label: "gold line draws" },
  { shot: "session", at: WHIP_AT + FLIGHT_FROM, kind: "swell", label: "cover lifts off" },
  { shot: "session", at: WHIP_AT + ARRIVE, kind: "hit", label: "phone takes over" },
  { shot: "session", at: LISTEN_AT, kind: "hit", label: "listen together" },
  { shot: "session", at: SHOT.frames - 6, kind: "click", label: "start a session" },
  ...CLIENTS.map((label, i): ShotCue => ({ shot: "session", at: WHIP_AT + CHIPS_FROM + i * CHIP_STEP, kind: "tick", label })),
];

const pointerSize = (scale: number): number => 38 / (LAYOUT.k * scale);

const DEVICES_BTN = plateBox("devices", "picker", "devices");
const IPHONE_ROW = plateBox("devices", "picker", "iphone");

const CURSOR: CursorStop[] = [
  { at: g(0), x: 330, y: 160 },
  { at: g(OPEN_PICKER), x: DEVICES_BTN.x + 16, y: DEVICES_BTN.y + 16, click: true, dwell: 0.2 },
  { at: g(PICK_PHONE), x: IPHONE_ROW.x + 120, y: IPHONE_ROW.y + 16, click: true },
];

function Desktop() {
  const frame = useCurrentFrame();
  const pointer = cursorAt(frame, CURSOR);
  const cam = addCam(
    camAt(
      frame,
      plateKeys(LAYOUT, [
        { at: g(0), box: FULL, scale: 1, ry: -3, rx: 0.6 },
        { at: g(8), box: FULL, scale: 1.02, ry: -3, rx: 0.6 },
        { at: g(OPEN_PICKER), box: { x: 880, y: 610, w: 560, h: 200 }, scale: 2, ry: -3 },
        { at: g(PICK_PHONE), box: { x: 940, y: 640, w: 420, h: 150 }, scale: 2.3, ry: -1 },
      ]),
    ),
    handheld(frame, 0.7),
  );
  const src = frame < OPEN_PICKER ? "queue/queue" : frame < PICK_PHONE ? "devices/picker" : "devices/handed-off";
  return (
    <Camera cam={cam}>
      <Plate src={film(src)} layout={LAYOUT} brightness={1.3} light={{ x: pointer.x, y: pointer.y, radius: 560, dim: 0.62, wash: 0 }}>
        <Bracket box={DEVICES_BTN} at={g(OPEN_PICKER - 6)} pad={8} arm={12} width={2.5} length={0.4} />
        <Bracket box={IPHONE_ROW} at={g(PICK_PHONE - 8)} pad={6} arm={12} width={2.5} length={0.4} />
        <Cursor stops={CURSOR} size={pointerSize(cam.scale)} />
      </Plate>
    </Camera>
  );
}

const MAC = { left: 70, top: 100, width: 1060 };
const PHONE = { left: 1360, top: 36, width: 430 };

const macScreen = (() => {
  const bezel = MAC.width * 0.011;
  const w = MAC.width - bezel * 2;
  const h = w * 0.625;
  return { x: MAC.left + bezel, y: MAC.top + MAC.width * 0.026, w, h, k: w / PLATE.w, strip: h * 0.1 };
})();

const phoneScreen = (() => {
  const bezel = PHONE.width * 0.034;
  const w = PHONE.width - bezel * 2;
  return { x: PHONE.left + bezel, y: PHONE.top + bezel, w, h: w * (2532 / 1170), k: w / 390 };
})();

const macPoint = (x: number, y: number) => ({ x: macScreen.x + x * macScreen.k, y: macScreen.y + macScreen.strip + y * macScreen.k });
const phonePoint = (x: number, y: number) => ({ x: phoneScreen.x + x * phoneScreen.k, y: phoneScreen.y + y * phoneScreen.k });

const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };
const FROM = macPoint(COVER_BOX.x + 77, COVER_BOX.y + 77);
const TO = phonePoint(32.5, 799);
const SIZE_FROM = COVER_BOX.w * macScreen.k;
const SIZE_TO = 42 * phoneScreen.k;
const SIZE_PEAK = 210;
const BEND = 0.5;
const STAGE = { w: 1920, h: 1080 };

function MacScreen({ src }: { src: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#050505" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "10%", borderBottom: "1px solid rgb(255 255 255 / 0.08)" }} />
      <Img src={src} style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "90%" }} />
    </div>
  );
}

function Flight({ frame }: { frame: number }) {
  const t = ramp(frame, FLIGHT_FROM, FLIGHT_LENGTH, ease.inOut);
  if (t <= 0 || t >= 1) return null;
  const at = connectPoint(FROM, TO, t, BEND);
  const size = lerp(SIZE_FROM, SIZE_TO, t) + (SIZE_PEAK - lerp(SIZE_FROM, SIZE_TO, 0.5)) * Math.sin(Math.PI * t) ** 1.4;
  return (
    <div style={{ position: "absolute", left: at.x - size / 2, top: at.y - size / 2, width: size, height: size }}>
      <Halation fill strength={0.55} radius={34}>
        <RealCrop src={film("queue/queue")} box={COVER_BOX} plate={PLATE} width={size} />
      </Halation>
    </div>
  );
}

function Landing({ frame }: { frame: number }) {
  const t = ramp(frame, ARRIVE, 22, ease.out);
  if (t <= 0 || t >= 1) return null;
  const r = lerp(30, 150, t);
  return (
    <i
      style={{
        position: "absolute",
        left: TO.x - r,
        top: TO.y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${lerp(6, 1, t)}px solid var(--ignite)`,
        opacity: (1 - t) ** 1.5,
      }}
    />
  );
}

function Devices() {
  const frame = useCurrentFrame();
  const arrived = frame >= ARRIVE;
  const rack = ramp(frame, 28, 28);
  const phoneBlur = 6 * (1 - ramp(frame, FLIGHT_FROM, FLIGHT_LENGTH, ease.inOut));
  const macBlur = 5 * rack * ramp(frame, ARRIVE - 14, 24);
  const cam = addCam(
    camAt(frame, [
      { at: g(0), scale: 1.05, ry: -9, rx: 1, x: 0, y: 0 },
      { at: g(120), scale: 1, ry: 3, rx: 0, x: 0, y: 0 },
      {
        at: g(LISTEN_AT - WHIP_AT),
        ...camTo({ x: 1220, y: 600, w: 560, h: 340 }, { scale: 1.75, ry: 7 }),
      },
    ]),
    handheld(frame, 0.8),
  );
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-140}>
          <div
            style={{
              position: "absolute",
              left: 420,
              top: 120,
              width: 1100,
              height: 800,
              background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 30%, transparent), transparent)",
              opacity: 0.75,
            }}
          />
        </Layer>
        <Layer z={0}>
          <div
            style={{ position: "absolute", inset: 0, filter: `brightness(1.3)${macBlur > 0.3 ? ` blur(${macBlur.toFixed(2)}px)` : ""}` }}
          >
            <DeviceFrame kind="mac" width={MAC.width} note={false} style={{ left: MAC.left, top: MAC.top }}>
              <MacScreen src={film("devices/handed-off")} />
            </DeviceFrame>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter: `brightness(1.3)${phoneBlur > 0.3 ? ` blur(${phoneBlur.toFixed(2)}px)` : ""}`,
            }}
          >
            <DeviceFrame
              kind="iphone"
              width={PHONE.width}
              note={false}
              src={film(arrived ? "devices/phone-after" : "devices/phone-before")}
              style={{ left: PHONE.left, top: PHONE.top }}
            />
          </div>
          <ConnectLine
            from={FROM}
            to={TO}
            at={g(LINE_AT)}
            length={1.1}
            bend={BEND}
            width={5}
            size={STAGE}
            pulse={{ at: g(FLIGHT_FROM - 8), length: 1.2 }}
          />
          <Flight frame={frame} />
          <Landing frame={frame} />
          {frame >= ARRIVE ? (
            <Bracket
              box={{ x: phoneScreen.x, y: phoneScreen.y + 771 * phoneScreen.k, w: phoneScreen.w, h: 73 * phoneScreen.k }}
              at={g(ARRIVE + 2)}
              pad={4}
              arm={30}
              width={3}
              length={0.5}
            />
          ) : null}
        </Layer>
        <Bokeh focusZ={0} z={300} count={14} seed={9} opacity={0.26} />
      </Camera>
      <div style={{ position: "absolute", left: 70, top: 884, display: "flex", gap: 14 }}>
        {CLIENTS.map((label, i) => {
          const t = ramp(frame, CHIPS_FROM + i * CHIP_STEP, 12, ease.out);
          return (
            <div key={label} style={{ overflow: "hidden", paddingBottom: 6 }}>
              <div
                data-legible=""
                style={{
                  transform: `translateY(${lerp(120, 0, t)}%)`,
                  padding: "8px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 28,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--foreground)",
                  border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
                  background: "rgb(0 0 0 / 0.7)",
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
      <div
        data-legible=""
        style={{
          position: "absolute",
          left: 70,
          top: 975,
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          color: "var(--muted-foreground)",
          opacity: ramp(frame, 16, 14),
        }}
      >
        device frames are art, screens are real captures
      </div>
    </>
  );
}

const CURSOR_LISTEN: CursorStop[] = [
  { at: g(0), x: 900, y: 420 },
  { at: g(SHOT.frames - LISTEN_AT - 6), x: START_SESSION.x + 60, y: START_SESSION.y + 13, click: true },
];

function Listen() {
  const frame = useCurrentFrame();
  const span = SHOT.frames - LISTEN_AT;
  const pointer = cursorAt(frame, CURSOR_LISTEN);
  const cam = addCam(
    camAt(
      frame,
      plateKeys(LAYOUT, [
        { at: g(0), box: { x: 220, y: 100, w: 700, h: 220 }, scale: 1.7, ry: -4 },
        { at: g(span), box: { x: 220, y: 150, w: 500, h: 150 }, scale: 2.1, ry: 2 },
      ]),
    ),
    handheld(frame, 0.7),
  );
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "#050505" }} />
      <Camera cam={cam}>
        <Plate
          src={film("listen-together/listen-together")}
          layout={LAYOUT}
          brightness={1.3}
          light={{ x: pointer.x, y: pointer.y, radius: 560, dim: 0.74, wash: 0 }}
        >
          <Bracket box={START_SESSION} at={g(8)} pad={7} arm={12} width={2.5} length={0.4} />
          <Cursor stops={CURSOR_LISTEN} size={pointerSize(cam.scale)} />
        </Plate>
      </Camera>
      <Chip text="listen together" from={4} style={{ left: 70, top: 950 }} />
    </>
  );
}

/** S8: the desktop hands its queue to the phone, then a listen together session starts. Picker, click, whip to both devices, a gold line draws and the real cover rides it onto the phone. */
export function SessionShot() {
  return (
    <>
      <Whip
        at={WHIP_AT}
        length={WHIP_LENGTH}
        direction="left"
        from={<Desktop />}
        to={
          <Sequence layout="none" from={WHIP_AT} durationInFrames={LISTEN_AT - WHIP_AT}>
            <Devices />
          </Sequence>
        }
      />
      <Sequence layout="none" from={LISTEN_AT}>
        <Listen />
      </Sequence>
      <Sequence layout="none" durationInFrames={LISTEN_AT}>
        <Chip text="one session" from={10} style={{ left: 70, top: 34 }} />
      </Sequence>
    </>
  );
}
