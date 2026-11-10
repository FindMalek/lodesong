import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Bracket } from "../design/draw";
import { Plate, plateKeys } from "../design/plate";
import { Whip } from "../design/whip";
import { ImportBars, ImportCovers } from "../ui/s4-import";
import { Chip, grid, LAYOUT, LIFT, plateFile, ShotTransit } from "../ui/s4-kit";
import { shotOf } from "./timelines";

const FRAMES = shotOf("import").frames;

const WHIP_AT = 56;
const WHIP = 8;
const BARS_AT = 4;

/** What the score needs from the import shot, in shot-local frames: the chip, the bars filling, the whip to the playlist. */
export const IMPORT_CUES: ShotCue[] = [
  { shot: "import", at: 6, kind: "ping", label: "import chip" },
  { shot: "import", at: BARS_AT + 4, kind: "tick", label: "import bars fill" },
  { shot: "import", at: WHIP_AT, kind: "whoosh", label: "whip to the imported playlist" },
];

const IMPORT_BOX = { x: 215, y: 90, w: 690, h: 290 };

const IMPORT_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: IMPORT_BOX, scale: 1.55, ry: -3, rx: 0.5 },
  { at: grid(WHIP_AT + WHIP), box: IMPORT_BOX, scale: 1.8, ry: 1 },
]);

function ImportState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, IMPORT_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("import-spotify/import-spotify")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT}>
        <ImportCovers />
        <ImportBars from={BARS_AT} />
        <Bracket box={{ x: 218, y: 186, w: 690, h: 64 }} at={grid(BARS_AT + 34)} pad={6} arm={12} width={2.5} length={0.5} />
      </Plate>
    </Camera>
  );
}

const PLAYLIST_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: { x: 120, y: 40, w: 900, h: 520 }, scale: 1.45, ry: -2, rx: 0.5 },
  { at: grid(FRAMES - WHIP_AT), box: { x: 120, y: 120, w: 900, h: 520 }, scale: 1.6, ry: 1 },
]);

function PlaylistState() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, PLAYLIST_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("home-mixes/mix")} layout={LAYOUT} focusZ={0} aperture={0.002} brightness={LIFT} />
    </Camera>
  );
}

/** Bring your playlists over: each playlist's bar on the import page fills gold, then the playlist is simply there, full of songs. */
export function ImportShot() {
  return (
    <>
      <ShotTransit frames={FRAMES} leave="left" arrive="right">
        <Whip
          at={WHIP_AT}
          length={WHIP}
          direction="left"
          from={<ImportState />}
          to={
            <Sequence layout="none" from={WHIP_AT}>
              <PlaylistState />
            </Sequence>
          }
        />
      </ShotTransit>
      <Chip text="import your playlists" from={6} x={96} y={960} lit={-1} />
    </>
  );
}
