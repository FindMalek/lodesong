import { Sequence, useCurrentFrame } from "remotion";
import { plateBox } from "../captures/film-manifest";
import { gridBeat } from "../design/beat";
import { Camera } from "../design/camera";
import { Bracket } from "../design/draw";
import { Halation } from "../design/halation";
import { ease, lerp, ramp } from "../design/motion";
import { Shell } from "../design/shell";
import { typedCount, typingFrames } from "../design/typing";
import { Whip } from "../design/whip";
import { GoldText, Patch, PlateFrame, plateFile } from "../ui/s4-kit";
import { FullScreenLyrics } from "../ui/s4-lyric-column";
import { developOf, Ignite, TILE_COUNT, TileCrop, TileVeil, tileBox } from "../ui/s6-tiles";
import { filmPlate } from "../ui/s8-real-crop";
import { CutChip, driftCam, g, PlateWindow } from "./cut-kit";

export const LOOP_FRAMES = gridBeat(20);

const ADVANCE_AT = 60;
const SCROLL_AT = 120;
const SEAM_WARM = 24;
const PALETTE_AT = 180;
const MIXES_AT = 300;
const BACK_AT = 480;
const WHIP = 10;
const REST_AT = 570;
const COVER = { x: 39, y: 48, w: 486, h: 486 };
const QUERY = "lights on";
const TYPED = typingFrames(QUERY, 10, 5);
const RESULTS_AT = (TYPED.at(-1) ?? 0) + 6;
const MARK = plateBox("find-the-line", "results", "mark");
const CHIP_Y = 905;

interface LyricsProps {
  scale: readonly [number, number];
  frames: number;
  hold?: boolean;
}

/** The full-screen lyrics: opens already lit (the seam depends on it), the song moves on a line, a far line takes over and the column scrolls. */
function Lyrics({ scale, frames, hold = false }: LyricsProps) {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, frames, { scale: { from: scale[0], to: scale[1] }, ry: { from: 0, to: 0 } });
  return (
    <Camera cam={cam}>
      <PlateFrame>
        <div style={{ position: "absolute", inset: 0, filter: "brightness(1.3)" }}>
          <Sequence layout="none" from={-SEAM_WARM}>
            <FullScreenLyrics
              advanceAt={hold ? 9999 : ADVANCE_AT + SEAM_WARM}
              clickAt={hold ? 9999 : SCROLL_AT + SEAM_WARM}
              scrollFrames={24}
            />
          </Sequence>
        </div>
        <Halation fill strength={0.14} radius={36}>
          <Patch src={plateFile("lyrics-full/word-04-0")} box={COVER} />
        </Halation>
      </PlateFrame>
    </Camera>
  );
}

function Palette() {
  const frame = useCurrentFrame();
  const typed = typedCount(frame, TYPED);
  const showing =
    frame >= RESULTS_AT
      ? filmPlate("find-the-line/results")
      : filmPlate(typed === 0 ? "find-the-line/palette-empty" : `find-the-line/type-${String(typed).padStart(2, "0")}`);
  const cam = driftCam(frame, MIXES_AT - PALETTE_AT, { scale: { from: 1, to: 1.06 }, x: { from: -10, to: 10 } });
  return (
    <Camera cam={cam}>
      <PlateWindow src={showing} box={{ x: 380, y: 140, w: 560, h: 310 }} x={232} y={60} width={1456} filter="brightness(1.9)">
        <Bracket box={{ x: MARK.x, y: MARK.y, w: MARK.w, h: MARK.h }} at={g(RESULTS_AT + 8)} pad={5} arm={8} width={2.5} length={0.4} />
      </PlateWindow>
    </Camera>
  );
}

const MIX_ROW = { x: 190, y: 538, w: 920, h: 250 };
const MIX_K = 1920 / MIX_ROW.w;

function Mixes() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, BACK_AT - MIXES_AT, { scale: { from: 1, to: 1.08 }, x: { from: 0, to: -90 } });
  const ignite = ramp(frame, 112, 36);
  return (
    <Camera cam={cam}>
      <PlateWindow
        src={filmPlate("home-mixes/home")}
        box={MIX_ROW}
        x={0}
        y={(1080 - MIX_ROW.h * MIX_K) / 2}
        width={1920}
        filter="brightness(1.8)"
      >
        {Array.from({ length: TILE_COUNT }, (_, i) => (
          <TileVeil key={tileBox(i).x} box={tileBox(i)} develop={developOf(frame, 6 + 12 * i, 40)} />
        ))}
        <div
          style={{
            position: "absolute",
            left: tileBox(0).x,
            top: tileBox(0).y,
            width: tileBox(0).w,
            height: tileBox(0).h,
            overflow: "hidden",
          }}
        >
          <TileCrop index={0} at={{ x: 0, y: 0 }}>
            <Ignite t={ignite} />
          </TileCrop>
        </div>
      </PlateWindow>
    </Camera>
  );
}

function LoopShot() {
  return (
    <>
      <GoldText />
      <Whip
        at={BACK_AT}
        length={WHIP}
        direction="down"
        from={
          <Whip
            at={MIXES_AT}
            length={WHIP}
            direction="left"
            from={
              <Whip
                at={PALETTE_AT}
                length={WHIP}
                direction="up"
                from={<Lyrics scale={[1, 1.05]} frames={PALETTE_AT} />}
                to={
                  <Sequence layout="none" from={PALETTE_AT}>
                    <Palette />
                  </Sequence>
                }
              />
            }
            to={
              <Sequence layout="none" from={MIXES_AT}>
                <Mixes />
              </Sequence>
            }
          />
        }
        to={
          <Sequence layout="none" from={BACK_AT}>
            <Lyrics scale={[1.05, 1]} frames={REST_AT - BACK_AT} hold />
          </Sequence>
        }
      />
      <CutChip text="synced lyrics" from={20} out={PALETTE_AT - 24} y={CHIP_Y} size={54} />
      <Sequence layout="none" from={PALETTE_AT}>
        <CutChip text="search by lyric" from={14} out={MIXES_AT - PALETTE_AT - 20} y={CHIP_Y} size={54} />
      </Sequence>
      <Sequence layout="none" from={MIXES_AT}>
        <CutChip text="mixes" from={18} out={BACK_AT - MIXES_AT - 20} y={CHIP_Y} size={54} />
      </Sequence>
    </>
  );
}

/** The readme loop: lyrics, search by lyric, mixes and a whip back to the same lit line at the same pose, so the last frame is the first. */
export function Loop({ probe = false }: { probe?: boolean }) {
  return (
    <Shell grain={false} probe={probe}>
      <LoopShot />
    </Shell>
  );
}
