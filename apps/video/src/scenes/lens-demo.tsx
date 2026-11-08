import { Sequence, useCurrentFrame } from "remotion";
import albumLyrics from "../../../../docs/album-lyrics.png";
import phone from "../../../../docs/phone.png";
import { beat } from "../design/beat";
import { addCam, Camera, CameraBlur, camAt, handheld, Layer } from "../design/camera";
import { Cursor, type CursorStop, cursorAt } from "../design/cursor";
import { DeviceFrame } from "../design/device-frame";
import { Bokeh, DofLayer, focusAt } from "../design/dof";
import { Bracket, ConnectLine } from "../design/draw";
import { Halation } from "../design/halation";
import { KaraokeLine, wordsOf } from "../design/karaoke-fill";
import { VOID } from "../design/kinetic";
import { Plate, type PlateSlice, plateKeys, plateLayout } from "../design/plate";
import { Shell } from "../design/shell";
import { Whip } from "../design/whip";

export const LENS_DEMO_BEATS = 12;

const LAYOUT = plateLayout(undefined, undefined, "contain");
const WHIP_AT = 3.75;

const SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 791 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 920, h: 791 }, z: 55 },
  { name: "lyrics", box: { x: 1119, y: 45, w: 321, h: 791 }, z: 110 },
  { name: "player", box: { x: 0, y: 836, w: 1440, h: 64 }, z: 150 },
];

const ROW = { x: 215, y: 272, w: 900, h: 52 };
const LYRIC_LINE = { x: 1126, y: 150, w: 210, h: 40 };

const CURSOR: CursorStop[] = [
  { at: 0, x: 760, y: 190 },
  { at: 1.5, x: 320, y: 298, click: true, dwell: 0.5 },
  { at: 3.25, x: 1210, y: 171, click: true },
];

const CAM_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: { x: 0, y: 0, w: 1440, h: 900 }, scale: 1, ry: -6, rx: 1 },
  { at: 2, box: ROW, maxScale: 1.45, fill: 0.5, ry: -1, rx: 0 },
  { at: 3.9, box: { x: 1119, y: 90, w: 321, h: 200 }, maxScale: 1.6, fill: 0.55, ry: 5, rx: -1 },
]);

const FOCUS = [
  { at: 0, z: 150 },
  { at: 2.2, z: 150 },
  { at: 3.3, z: 110 },
];

function PlateShot() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, CAM_KEYS), handheld(frame, 0.8));
  const pointer = cursorAt(Math.max(0, frame - 9), CURSOR);
  return (
    <Camera cam={cam}>
      <Plate
        src={albumLyrics}
        layout={LAYOUT}
        slices={SLICES}
        focusZ={focusAt(frame, FOCUS)}
        aperture={0.016}
        light={{ x: pointer.x, y: pointer.y, radius: 420, dim: 0.4, wash: 0.12 }}
      >
        <Bracket box={ROW} at={1.5} pad={6} />
        <Bracket box={LYRIC_LINE} at={3.25} pad={8} arm={14} width={2.5} />
        <Cursor stops={CURSOR} size={36 / (LAYOUT.k * cam.scale)} />
      </Plate>
    </Camera>
  );
}

const LINE_ONE = wordsOf("the quiet between neon", 0.2, 1.7);
const LINE_TWO = wordsOf("I keep the lights on", 2, 1.5);
const RACK = [
  { at: 0, z: 300 },
  { at: 1.4, z: 300 },
  { at: 2.3, z: 0 },
];

function LyricShot() {
  const frame = useCurrentFrame();
  const focusZ = focusAt(frame, RACK);
  const cam = camAt(frame, [
    { at: 0, scale: 1.07, ry: -2, x: 30 },
    { at: 4.2, scale: 1, ry: 1.5, x: 0 },
  ]);
  return (
    <Camera cam={cam}>
      <Layer z={-120}>
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 200,
            width: 1100,
            height: 700,
            background: "radial-gradient(ellipse closest-side, color-mix(in oklch, var(--ignite) 38%, transparent), transparent)",
            opacity: 0.8,
          }}
        />
      </Layer>
      <DofLayer z={0} focusZ={focusZ} aperture={0.03}>
        <Halation fill strength={0.26} radius={34}>
          <div style={{ position: "absolute", left: 160, top: 330, width: 1600, display: "flex", flexDirection: "column", gap: 22 }}>
            <KaraokeLine words={LINE_ONE} size={132} />
            <KaraokeLine words={LINE_TWO} size={132} />
          </div>
        </Halation>
      </DofLayer>
      <Bokeh focusZ={focusZ} z={300} count={15} seed={4} />
    </Camera>
  );
}

const MAC = { x: 110, y: 170, w: 1010 };
const PHONE = { x: 1400, y: 150, w: 330 };
const FROM = { x: MAC.x + MAC.w, y: 470 };
const TO = { x: PHONE.x, y: 440 };
const PHONE_SCREEN = { x: PHONE.x + 12, y: PHONE.y + 12, w: PHONE.w - 24, h: 660 };

const RACK_DEVICES = [
  { at: 0, z: 0 },
  { at: 2.3, z: 0 },
  { at: 3.3, z: 90 },
];

function DevicesShot() {
  const frame = useCurrentFrame();
  const focusZ = focusAt(frame, RACK_DEVICES);
  const cam = camAt(frame, [
    { at: 0, ry: -8, scale: 1.02 },
    { at: 4.2, ry: 6, scale: 1 },
  ]);
  return (
    <CameraBlur samples={6} shutter={0.6} backdrop={VOID}>
      <Camera cam={cam}>
        <DofLayer z={0} focusZ={focusZ} aperture={0.035}>
          <DeviceFrame kind="mac" width={MAC.w} src={albumLyrics} label="mac" style={{ left: MAC.x, top: MAC.y }} />
        </DofLayer>
        <DofLayer z={90} focusZ={focusZ} aperture={0.035}>
          <DeviceFrame kind="iphone" width={PHONE.w} src={phone} label="iphone" style={{ left: PHONE.x, top: PHONE.y }} />
          <Bracket box={PHONE_SCREEN} at={3.4} length={0.7} pad={6} arm={34} />
        </DofLayer>
        <Layer z={60}>
          <ConnectLine from={FROM} to={TO} at={0.4} length={1.6} bend={0.45} pulse={{ at: 2.2, length: 1.2 }} size={{ w: 1920, h: 1080 }} />
        </Layer>
      </Camera>
    </CameraBlur>
  );
}

function WhipShot() {
  return (
    <Whip
      at={beat(WHIP_AT)}
      length={9}
      direction="left"
      from={<LyricShot />}
      to={
        <Sequence layout="none" from={beat(WHIP_AT)}>
          <DevicesShot />
        </Sequence>
      }
    />
  );
}

export function LensDemo({ probe }: { probe?: boolean }) {
  return (
    <Shell probe={probe}>
      <Sequence layout="none" durationInFrames={beat(4)}>
        <PlateShot />
      </Sequence>
      <Sequence layout="none" from={beat(4)}>
        <WhipShot />
      </Sequence>
    </Shell>
  );
}
