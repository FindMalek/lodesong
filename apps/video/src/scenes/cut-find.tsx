import { Sequence, useCurrentFrame } from "remotion";
import { plateBox } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { Bracket } from "../design/draw";
import { glowOf } from "../design/gold";
import { Halation } from "../design/halation";
import { ramp } from "../design/motion";
import { typedCount, typingFrames } from "../design/typing";
import { FullScreenLyrics } from "../ui/s4-lyric-column";
import { filmPlate } from "../ui/s8-real-crop";
import { COVER, CutChip, driftCam, GoldCover, g, Hit, PlateWindow, Stamp } from "./cut-kit";
import { cutOf } from "./timelines";

const SHOT = cutOf("find");
const IGNITE_AT = SHOT.beat(4);
const QUERY = "lights on";
const TYPE_AT = 14;
const LANDINGS = typingFrames(QUERY, TYPE_AT, 5);
const RESULTS_AT = (LANDINGS.at(-1) ?? 0) + 6;
const MARK_AT = RESULTS_AT + 8;
const ENTER_AT = IGNITE_AT - 14;

const PALETTE = { x: 380, y: 140, w: 375, h: 400 };
const PALETTE_AT = { x: 90, y: 500, width: 900 };
const MARK = plateBox("find-the-line", "results", "mark");

const LYRICS_BOX = { x: 560, y: 150, w: 720, h: 290 };
const LYRICS_AT = { x: 0, y: 1062, width: 1080 };
const ADVANCE_AT = 42;
const SCROLL_AT = 84;

export const CUT_FIND_CUES: readonly ShotCue[] = [
  { shot: "find", at: 2, kind: "key", label: "cmd k" },
  ...LANDINGS.map((at, i): ShotCue => ({ shot: "find", at, kind: "typed", label: `type: ${QUERY[i]}` })),
  { shot: "find", at: RESULTS_AT, kind: "tick", label: "results open" },
  { shot: "find", at: MARK_AT, kind: "tick", label: "underline draws under lights on" },
  { shot: "find", at: ENTER_AT, kind: "key", label: "enter picks the line" },
  { shot: "find", at: IGNITE_AT, kind: "kick", label: "ignite: the cover catches gold" },
  { shot: "find", at: IGNITE_AT + 2, kind: "pluck", label: "line hold lights" },
  { shot: "find", at: IGNITE_AT + ADVANCE_AT, kind: "pluck", label: "line say it slowly" },
  { shot: "find", at: IGNITE_AT + SCROLL_AT, kind: "pluck", label: "line scrolls on" },
];

const plateOfType = (count: number): string =>
  filmPlate(count === 0 ? "find-the-line/palette-empty" : `find-the-line/type-${String(count).padStart(2, "0")}`);

function Palette() {
  const frame = useCurrentFrame();
  const typed = typedCount(frame, LANDINGS);
  const showing = frame >= RESULTS_AT ? filmPlate("find-the-line/results") : plateOfType(typed);
  const cam = driftCam(frame, IGNITE_AT, { scale: { from: 1, to: 1.08 }, y: { from: 0, to: 24 }, ry: { from: 2.5, to: -1.5 } });
  return (
    <Camera cam={cam}>
      <Layer z={0}>
        <PlateWindow src={showing} box={PALETTE} {...PALETTE_AT} filter="brightness(1.9)">
          <Bracket box={{ x: MARK.x, y: MARK.y, w: MARK.w, h: MARK.h }} at={g(MARK_AT)} pad={5} arm={8} width={2.5} length={0.4} />
        </PlateWindow>
      </Layer>
      <Bokeh focusZ={0} z={300} count={6} seed={5} opacity={0.12} width={1080} height={1920} />
    </Camera>
  );
}

function Lyrics() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, SHOT.frames - IGNITE_AT, {
    scale: { from: 1.03, to: 1 },
    y: { from: -10, to: 0 },
    ry: { from: 1.5, to: -1 },
  });
  const ignite = ramp(frame, 2, 26);
  return (
    <Camera cam={cam}>
      <Layer z={-120}>
        <div
          style={{
            position: "absolute",
            left: COVER.x - 260,
            top: COVER.y - 200,
            width: COVER.size + 520,
            height: COVER.size + 520,
            background: glowOf(0.55 * ignite, 40),
          }}
        />
      </Layer>
      <Layer z={70}>
        <div style={{ position: "absolute", left: COVER.x, top: COVER.y }}>
          <GoldCover sat={0} />
          {ignite > 0 ? (
            <Halation fill strength={0.25 * ignite} radius={40}>
              <GoldCover reveal={ignite} />
            </Halation>
          ) : null}
        </div>
      </Layer>
      <Layer z={0}>
        <PlateWindow box={LYRICS_BOX} {...LYRICS_AT} fade={70}>
          <FullScreenLyrics advanceAt={ADVANCE_AT} clickAt={SCROLL_AT} scrollFrames={24} />
        </PlateWindow>
      </Layer>
      <Bokeh focusZ={0} z={300} count={8} seed={11} opacity={0.14} width={1080} height={1920} />
    </Camera>
  );
}

/** Cut 2: ⌘K, `lights on` typed into the real palette, ↵, and the cover catches gold as the lyrics follow the song line by line. */
export function FindScene() {
  return (
    <>
      <Sequence layout="none" durationInFrames={IGNITE_AT}>
        <Palette />
      </Sequence>
      <Sequence layout="none" from={IGNITE_AT}>
        <Lyrics />
      </Sequence>
      <Stamp labels={["⌘", "K"]} at={2} out={TYPE_AT + 44} y={300} />
      <Stamp labels={["↵"]} at={ENTER_AT} out={IGNITE_AT + 2} y={300} />
      <CutChip text="type what you remember" from={22} out={IGNITE_AT - 12} y={1486} />
      <CutChip text="plays from that line" from={IGNITE_AT + 10} y={1486} />
      <Hit at={IGNITE_AT} strength={0.16} />
    </>
  );
}
