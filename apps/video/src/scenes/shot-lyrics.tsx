import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bokeh } from "../design/dof";
import { Halation } from "../design/halation";
import { LightPool } from "../design/light-pool";
import { ease, lerp, ramp } from "../design/motion";
import { plateKeys } from "../design/plate";
import { Chip, grid, LAYOUT, Patch, PlateFrame, plateFile, ShotTransit } from "../ui/s4-kit";
import { FullScreenLyrics } from "../ui/s4-lyric-column";
import { LINE_SAY, LINE_STAY, wordSpans } from "../ui/s4-lyric-data";
import { shotOf } from "./timelines";

const SHOT = shotOf("lyrics");

const F = { sing: 8, click: 240, scroll: 22 } as const;

const SAY_SPANS = wordSpans(LINE_SAY, F.sing);
const STAY_SPANS = wordSpans(LINE_STAY, F.click + 3);

/** What the score needs from S4, in shot-local frames: a pluck on each line start and a tick on each word. */
export const S4_CUES: ShotCue[] = [
  { shot: "lyrics", at: F.sing, kind: "pluck", label: "line say it slowly" },
  ...SAY_SPANS.slice(1).map((span, i) => ({ shot: "lyrics", at: span.from, kind: "tick", label: `word ${LINE_SAY.words[i + 1]?.text}` })),
  { shot: "lyrics", at: F.click, kind: "click", label: "click line" },
  { shot: "lyrics", at: F.click + 3, kind: "pluck", label: "line stay until" },
  ...STAY_SPANS.slice(1)
    .map((span, i) => ({ shot: "lyrics", at: span.from, kind: "tick", label: `word ${LINE_STAY.words[i + 1]?.text}` }))
    .filter((cue) => cue.at < SHOT.frames - 8),
];

/** The cover sits at (54, 66), 646 px: where S3 ends, so the cut from S3 does not move it. Front-on, the neutral camera shifted two pixels. */
const KEYS = [
  { at: 0, scale: 1, x: -2, y: -2, rx: 0, ry: 0 },
  ...plateKeys(LAYOUT, [
    { at: grid(80), box: { x: 160, y: 230, w: 1160, h: 340 }, scale: 1.06, ry: -1 },
    { at: grid(F.click + 16), box: { x: 120, y: 260, w: 1200, h: 340 }, scale: 1.1, ry: 0.5 },
    { at: grid(SHOT.frames - 1), box: { x: 120, y: 280, w: 1200, h: 340 }, scale: 1.16, ry: 0 },
  ]),
];

const CURSOR: CursorStop[] = [
  { at: grid(190), x: 1290, y: 650 },
  { at: grid(F.click), x: 880, y: 584, click: true, dwell: 1 },
];

const COVER = { x: 39, y: 48, w: 486, h: 486 };

/** S4, the lyrics: opens on the full-screen view with the cover where S3 left it, the gold fill sings a line word by word on the real timings, a click jumps the song to another line and the cover stays in frame to the end. */
export function LyricsShot() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, KEYS), handheld(frame, 0.4));
  const scroll = ramp(frame - F.click, 0, F.scroll, ease.out);
  const pool = { x: 760, y: lerp(366, 405, scroll), radius: 900, dim: 0.85, wash: 0.04 };
  const cursorOpacity = ramp(frame, 190, 8) * (1 - ramp(frame, F.click + 18, 8, ease.in));
  return (
    <ShotTransit frames={SHOT.frames} leave="left">
      <Camera cam={cam}>
        <PlateFrame>
          <div style={{ position: "absolute", inset: 0, filter: "brightness(1.3)" }}>
            <LightPool {...pool}>
              <FullScreenLyrics singAt={F.sing} clickAt={F.click} scrollFrames={F.scroll} />
            </LightPool>
          </div>
          <Halation fill strength={0.14} radius={36}>
            <Patch src={plateFile("lyrics-full/word-04-0")} box={COVER} />
          </Halation>
          <div style={{ opacity: cursorOpacity }}>
            <Cursor stops={CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
          </div>
        </PlateFrame>
        <Bokeh focusZ={0} z={300} count={6} seed={8} opacity={0.1} />
      </Camera>
      <Chip text="word by word" from={F.sing + 10} out={F.click - 8} x={1480} y={960} />
    </ShotTransit>
  );
}
