import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { Camera, Layer } from "../design/camera";
import { Bokeh } from "../design/dof";
import { glowOf } from "../design/gold";
import { Halation } from "../design/halation";
import { ease, lerp, ramp } from "../design/motion";
import { developOf, Ignite, TileCrop, TileVeil, tileBox } from "../ui/s6-tiles";
import { filmPlate } from "../ui/s8-real-crop";
import { COVER, CutChip, driftCam, Hit, PlateWindow } from "./cut-kit";
import { cutOf } from "./timelines";

const SHOT = cutOf("mixes");
const TILE = tileBox(0).w;
const SLOT = [
  { x: 90, y: 300 },
  { x: 590, y: 690 },
  { x: 90, y: 1080 },
] as const;
const SLOT_SIZE = 400;
const DEVELOP_AT = [0, 8, 16] as const;
const DEVELOP_FRAMES = 26;
const RUSH_AT = 38;
const LAND_AT = 62;
const IGNITE_FRAMES = 28;
const ROWS_AT = 76;

export const CUT_MIXES_CUES: readonly ShotCue[] = [
  ...DEVELOP_AT.map((at, i): ShotCue => ({ shot: "mixes", at: at + 2, kind: "pluck", label: `tile ${i + 1} develops` })),
  { shot: "mixes", at: RUSH_AT, kind: "whoosh", label: "one tile rushes forward" },
  { shot: "mixes", at: LAND_AT, kind: "hit", label: "mix opens" },
  { shot: "mixes", at: LAND_AT + 2, kind: "ping", label: "cover ignites gold" },
  { shot: "mixes", at: ROWS_AT, kind: "tick", label: "tracklist settles" },
];

interface TileProps {
  index: number;
  x: number;
  y: number;
  size: number;
  develop: number;
  ignite?: number;
  opacity?: number;
}

function Tile({ index, x, y, size, develop, ignite = 0, opacity = 1 }: TileProps) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: size, height: size, overflow: "hidden", opacity }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: TILE,
          height: TILE,
          transformOrigin: "0 0",
          transform: `scale(${size / TILE})`,
        }}
      >
        <TileCrop index={index} at={{ x: 0, y: 0 }}>
          {ignite > 0 ? <Ignite t={ignite} /> : null}
        </TileCrop>
        <TileVeil box={{ x: 0, y: 0, w: TILE, h: TILE }} develop={develop} />
      </div>
    </div>
  );
}

/** Cut 3: three real mix tiles open dot by dot, one rushes the camera and lands in the cover slot, catching gold over its tracklist. */
export function MixesScene() {
  const frame = useCurrentFrame();
  const cam = driftCam(frame, SHOT.frames, { scale: { from: 1, to: 1.07 }, y: { from: 0, to: -18 }, ry: { from: 3, to: -1.5 } });
  const rush = ramp(frame, RUSH_AT, LAND_AT - RUSH_AT, ease.inOut);
  const ignite = ramp(frame, LAND_AT, IGNITE_FRAMES);
  const rows = ramp(frame, ROWS_AT, 14);
  const others = 1 - 0.78 * rush;
  const lead = {
    x: lerp(SLOT[1].x, COVER.x, rush),
    y: lerp(SLOT[1].y, COVER.y, rush),
    size: lerp(SLOT_SIZE, COVER.size, rush),
  };
  return (
    <>
      <Camera cam={cam}>
        <Layer z={-120}>
          <div
            style={{
              position: "absolute",
              left: COVER.x - 260,
              top: COVER.y - 200,
              width: COVER.size + 520,
              height: COVER.size + 520,
              background: glowOf(0.6 * ignite, 40),
            }}
          />
        </Layer>
        {[0, 2].map((slot) => (
          <Layer key={slot} z={slot === 0 ? 30 : -30}>
            <Tile
              index={slot === 0 ? 1 : 2}
              x={SLOT[slot]?.x ?? 0}
              y={SLOT[slot]?.y ?? 0}
              size={SLOT_SIZE}
              develop={developOf(frame, DEVELOP_AT[slot] ?? 0, DEVELOP_FRAMES)}
              opacity={others}
            />
          </Layer>
        ))}
        <Layer z={lerp(0, 90, rush)}>
          <Halation fill strength={0.3 * ignite} radius={36}>
            <Tile index={0} {...lead} develop={developOf(frame, DEVELOP_AT[1], DEVELOP_FRAMES)} ignite={ignite} />
          </Halation>
        </Layer>
        <Layer z={0}>
          <div style={{ opacity: rows }}>
            <PlateWindow
              src={filmPlate("home-mixes/mix")}
              box={{ x: 200, y: 285, w: 450, h: 180 }}
              x={90}
              y={1068}
              width={900}
              filter="brightness(1.8)"
            />
          </div>
        </Layer>
        <Bokeh focusZ={0} z={300} count={8} seed={7} opacity={0.14} width={1080} height={1920} />
      </Camera>
      <CutChip text="mixes from what you play" from={14} y={1486} />
      <Hit at={LAND_AT} strength={0.2} />
    </>
  );
}
