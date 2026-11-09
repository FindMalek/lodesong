import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bokeh } from "../design/dof";
import { Bracket } from "../design/draw";
import { Halation } from "../design/halation";
import { LightPool } from "../design/light-pool";
import { ease, lerp, ramp } from "../design/motion";
import { Plate, type PlateSlice, plateKeys } from "../design/plate";
import { Chip, grid, KeyStamp, LAYOUT, Patch, PlateFrame, plateFile, ShotTransit } from "../ui/s4-kit";
import { FullScreenLyrics } from "../ui/s4-lyric-column";
import { LINE_SAY, LINE_STAY, wordSpans } from "../ui/s4-lyric-data";
import { shotOf } from "./timelines";

const SHOT = shotOf("lyrics");

const F = {
  sing: 8,
  click: 240,
  scroll: 22,
  shiftF: 262,
  cut: 270,
  nudge: 304,
} as const;

const SAY_SPANS = wordSpans(LINE_SAY, F.sing);
const STAY_SPANS = wordSpans(LINE_STAY, F.click + 3);

/** What the score needs from S4, in shot-local frames: a pluck on each line start, a tick on each word, the keys on the strike. */
export const S4_CUES: ShotCue[] = [
  { shot: "lyrics", at: F.sing, kind: "pluck", label: "line say it slowly" },
  ...SAY_SPANS.slice(1).map((span, i) => ({ shot: "lyrics", at: span.from, kind: "tick", label: `word ${LINE_SAY.words[i + 1]?.text}` })),
  { shot: "lyrics", at: F.click, kind: "click", label: "click line" },
  { shot: "lyrics", at: F.click + 3, kind: "pluck", label: "line stay until" },
  ...STAY_SPANS.slice(1)
    .map((span, i) => ({ shot: "lyrics", at: span.from, kind: "tick", label: `word ${LINE_STAY.words[i + 1]?.text}` }))
    .filter((cue) => cue.at < F.cut),
  { shot: "lyrics", at: F.shiftF, kind: "key", label: "shift f leaves full screen" },
  { shot: "lyrics", at: F.cut, kind: "hit", label: "back to the panel" },
  { shot: "lyrics", at: F.nudge, kind: "key", label: "] nudge later 0.25 s" },
].sort((a, b) => a.at - b.at);

const SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 765 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 921, h: 765 }, z: 55 },
  { name: "lyrics", box: { x: 1120, y: 45, w: 320, h: 765 }, z: 110 },
];

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };

const PANEL_KEYS = plateKeys(LAYOUT, [
  { at: grid(F.cut), box: WHOLE, scale: 1.04, ry: -5, rx: 1 },
  { at: grid(F.cut + 24), box: { x: 1120, y: 130, w: 320, h: 560 }, scale: 1.4, ry: 3, rx: 0 },
  { at: grid(F.nudge + 8), box: { x: 1120, y: 560, w: 320, h: 250 }, scale: 1.8, ry: 2, rx: 0 },
  { at: grid(SHOT.frames - 1), box: { x: 1120, y: 600, w: 320, h: 210 }, scale: 1.9, ry: 1, rx: 0 },
]);

/** The cover sits at (54, 66), 646 px: where S3 ends, so the cut from S3 does not move it. Front-on, the neutral camera shifted two pixels. */
const SCREEN_KEYS = [
  { at: 0, scale: 1, x: -2, y: -2, rx: 0, ry: 0 },
  ...plateKeys(LAYOUT, [
    { at: grid(70), box: { x: 440, y: 300, w: 900, h: 160 }, scale: 1.1, ry: -1 },
    { at: grid(F.click + 14), box: { x: 520, y: 330, w: 880, h: 200 }, scale: 1.18, ry: 0.5 },
    { at: grid(F.cut - 1), box: { x: 520, y: 340, w: 880, h: 200 }, scale: 1.24, ry: 0 },
  ]),
];

const CURSOR: CursorStop[] = [
  { at: grid(190), x: 1290, y: 650 },
  { at: grid(F.click), x: 880, y: 584, click: true, dwell: 1 },
];

const KEY_X = 96;
const COVER = { x: 39, y: 48, w: 486, h: 486 };
const FOOTER_AFTER = { x: 1128, y: 694, w: 150, h: 30 };

function PanelScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, PANEL_KEYS), handheld(frame, 0.7));
  const src = plateFile(frame >= F.nudge ? "lyrics-nudge/after" : "lyrics-nudge/before");
  return (
    <Camera cam={cam}>
      <Plate
        src={src}
        layout={LAYOUT}
        slices={SLICES}
        focusZ={110}
        aperture={0.012}
        light={{ x: 1280, y: 420, radius: 700, dim: 0.62, wash: 0.05 }}
      >
        <Bracket box={FOOTER_AFTER} at={grid(F.nudge + 2)} pad={6} arm={12} width={2.5} />
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={3} opacity={0.1} />
    </Camera>
  );
}

function ScreenScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, SCREEN_KEYS), handheld(frame, 0.4));
  const scroll = ramp(frame - F.click, 0, F.scroll, ease.out);
  const pool = { x: 900, y: lerp(366, 405, scroll), radius: 760, dim: 0.66, wash: 0.04 };
  const cursorOpacity = ramp(frame, 190, 8) * (1 - ramp(frame, F.click + 18, 8, ease.in));
  return (
    <Camera cam={cam}>
      <PlateFrame>
        <div style={{ position: "absolute", inset: 0, filter: "brightness(1.12)" }}>
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
  );
}

/** S4, the lyrics: opens on the full-screen view with the cover where S3 left it, the gold fill sings a line word by word on the real timings, a click jumps the song to another line, `⇧F` drops back to the panel and `]` shifts the timing. */
export function LyricsShot() {
  const frame = useCurrentFrame();
  return (
    <ShotTransit frames={SHOT.frames} leave="left">
      {frame < F.cut ? <ScreenScene /> : <PanelScene />}
      <KeyStamp label="⇧F" at={F.shiftF} x={KEY_X} wide hold={12} />
      <KeyStamp label="]" at={F.nudge} x={KEY_X} />
      <Chip text="word by word" from={F.sing + 10} out={F.click - 8} x={1480} y={960} />
      <Chip text="[ ] fix timing" from={F.nudge + 8} x={96} y={930} />
    </ShotTransit>
  );
}
