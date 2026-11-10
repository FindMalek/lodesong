import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Bracket } from "../design/draw";
import { Plate, plateKeys } from "../design/plate";
import { Whip } from "../design/whip";
import { ImportBars, ImportCovers } from "../ui/s4-import";
import { Chip, flat, grid, LAYOUT, LIFT, plateFile, ShotTransit } from "../ui/s4-kit";
import { shotOf } from "./timelines";

const FRAMES = shotOf("import").frames;

const WHIP_AT = 52;
const WHIP = 8;

/** What the score needs from the import shot, in shot-local frames: the chip, the whip from the doctor, the bars filling. */
export const IMPORT_CUES: ShotCue[] = [
  { shot: "import", at: 6, kind: "ping", label: "import chip" },
  { shot: "import", at: WHIP_AT, kind: "whoosh", label: "whip to the import page" },
  { shot: "import", at: WHIP_AT + 12, kind: "tick", label: "import bars fill" },
];

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };

const DOCTOR_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.3, ry: 3, rx: 0.5 },
  { at: grid(26), box: { x: 215, y: 55, w: 640, h: 130 }, scale: 2.1, ry: -1 },
  { at: grid(WHIP_AT + WHIP), box: { x: 215, y: 55, w: 640, h: 130 }, scale: 2.2, ry: 0 },
]);

function DoctorState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, DOCTOR_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("doctor/doctor")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        <i style={{ position: "absolute", left: 215, top: 140, width: 700, height: 48, background: flat(27) }} />
        <i style={{ position: "absolute", left: 215, top: 372, width: 700, height: 80, background: flat(27) }} />
        <Bracket box={{ x: 215, y: 118, w: 590, h: 18 }} at={grid(30)} pad={6} arm={12} width={2.5} length={0.5} />
      </Plate>
    </Camera>
  );
}

const IMPORT_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.2, ry: -3, rx: 0.5 },
  { at: grid(26), box: { x: 215, y: 170, w: 690, h: 90 }, scale: 2.05, ry: 2 },
  { at: grid(FRAMES - WHIP_AT), box: { x: 215, y: 170, w: 690, h: 90 }, scale: 2.15, ry: 0 },
]);

function ImportState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, IMPORT_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("import-spotify/import-spotify")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        <ImportCovers />
        <ImportBars from={14} />
        <Bracket box={{ x: 218, y: 186, w: 690, h: 64 }} at={grid(34)} pad={6} arm={12} width={2.5} length={0.5} />
      </Plate>
    </Camera>
  );
}

/** Bring a library over: the doctor's health bar, then the import page where each playlist's bar fills gold. */
export function ImportShot() {
  return (
    <>
      <ShotTransit frames={FRAMES} leave="left" arrive="right">
        <Whip
          at={WHIP_AT}
          length={WHIP}
          direction="left"
          from={<DoctorState />}
          to={
            <Sequence layout="none" from={WHIP_AT}>
              <ImportState />
            </Sequence>
          }
        />
      </ShotTransit>
      <Chip text="bring your library over" from={6} x={96} y={960} lit={-1} />
    </>
  );
}
