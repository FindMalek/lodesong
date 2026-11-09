import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bracket } from "../design/draw";
import { Plate, plateKeys } from "../design/plate";
import { Whip } from "../design/whip";
import { Chip, grid, KeyStamp, LAYOUT, LIFT, plateFile, ShotTransit } from "../ui/s4-kit";
import { ImportBars } from "../ui/s4-lyterion";
import { shotOf } from "./timelines";

const FRAMES = shotOf("lyterion").frames;

const W1 = 80;
const W2 = 170;
const WHIP = 8;
const CLICK = 38;
const KEY = 8;

/** What the score needs from lyterion, in shot-local frames: the bars filling, the whips, the click that hands songs over, the keys. */
export const LYTERION_CUES: ShotCue[] = [
  { shot: "lyterion", at: 6, kind: "ping", label: "lyterion chip" },
  { shot: "lyterion", at: 14, kind: "tick", label: "import bars fill" },
  { shot: "lyterion", at: W1, kind: "whoosh", label: "whip to the library doctor" },
  { shot: "lyterion", at: W1 + CLICK, kind: "click", label: "click fix all shown with lyterion" },
  { shot: "lyterion", at: W1 + CLICK + 1, kind: "ping", label: "100 songs sent to lyterion" },
  { shot: "lyterion", at: W2, kind: "whoosh", label: "whip to add by link" },
  { shot: "lyterion", at: W2 + KEY, kind: "key", label: "cmd k" },
  { shot: "lyterion", at: W2 + KEY + 14, kind: "tick", label: "link understood" },
];

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };

const IMPORT_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.05, ry: -4, rx: 0.5 },
  { at: grid(40), box: { x: 190, y: 80, w: 720, h: 190 }, scale: 1.85, ry: 2 },
  { at: grid(W1 + WHIP), box: { x: 190, y: 80, w: 720, h: 190 }, scale: 1.95, ry: 0 },
]);

function ImportState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, IMPORT_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("import-spotify/import-spotify")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        <ImportBars from={14} />
        <Bracket box={{ x: 195, y: 128, w: 700, h: 52 }} at={grid(34)} pad={6} arm={12} width={2.5} length={0.5} />
      </Plate>
    </Camera>
  );
}

const DOCTOR_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.04, ry: 3, rx: 0.5 },
  { at: grid(30), box: { x: 520, y: 380, w: 920, h: 330 }, scale: 1.4, ry: -1 },
  { at: grid(W2 - W1 + WHIP), box: { x: 520, y: 390, w: 920, h: 320 }, scale: 1.5, ry: 0 },
]);

const DOCTOR_CURSOR: CursorStop[] = [
  { at: 0, x: 980, y: 300 },
  { at: grid(CLICK), x: 1313, y: 404, click: true, dwell: 1 },
];

function DoctorState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, DOCTOR_KEYS), handheld(frame, 0.5));
  const fixed = frame >= CLICK;
  return (
    <Camera cam={cam}>
      <Plate src={plateFile(fixed ? "doctor/fixed" : "doctor/doctor")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        {fixed ? <Bracket box={{ x: 542, y: 630, w: 356, h: 50 }} at={grid(CLICK + 4)} pad={6} arm={12} width={2.5} length={0.5} /> : null}
        <Cursor stops={DOCTOR_CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
      </Plate>
    </Camera>
  );
}

const LINK_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.04, ry: -3 },
  { at: grid(22), box: { x: 330, y: 110, w: 780, h: 150 }, scale: 1.65, ry: 2 },
  { at: grid(FRAMES - W2), box: { x: 330, y: 110, w: 780, h: 150 }, scale: 1.8, ry: 0 },
]);

function LinkState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, LINK_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("add-track/link")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        <Bracket box={{ x: 380, y: 210, w: 680, h: 32 }} at={grid(KEY + 14)} pad={5} arm={10} width={2.5} length={0.5} />
      </Plate>
    </Camera>
  );
}

function States() {
  return (
    <Whip
      at={W1}
      length={WHIP}
      direction="left"
      from={<ImportState />}
      to={
        <Sequence layout="none" from={W1}>
          <Whip
            at={W2 - W1}
            length={WHIP}
            direction="left"
            from={<DoctorState />}
            to={
              <Sequence layout="none" from={W2 - W1}>
                <LinkState />
              </Sequence>
            }
          />
        </Sequence>
      }
    />
  );
}

/** Lyterion, the library companion: it syncs a Spotify library in (progress per playlist), the library doctor hands songs to it for a better copy, and a pasted link becomes a song. */
export function LyterionShot() {
  return (
    <>
      <ShotTransit frames={FRAMES} leave="left" arrive="right">
        <States />
        <KeyStamp label="⌘K" at={W2 + KEY} wide hold={22} />
      </ShotTransit>
      <Chip text="lyterion  fills your library" from={6} x={96} y={960} lit={0} />
    </>
  );
}
