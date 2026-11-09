import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld, STAGE } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { DitherWipe } from "../design/dither-wipe";
import { Bokeh } from "../design/dof";
import { Bracket } from "../design/draw";
import { ease, lerp, ramp } from "../design/motion";
import { Plate, type PlateSlice, plateKeys } from "../design/plate";
import { Chip, grid, LAYOUT, plateFile, ShotTransit } from "../ui/s4-kit";
import { developOf, Ignite, TILE_COUNT, TileCrop, TileVeil, tileBox } from "../ui/s6-tiles";
import { shotOf } from "./timelines";

const SHOT = shotOf("mixes");

const T = { first: 16, stagger: 14, length: 16, pullback: 112, click: 146, rush: 148, cut: 172 } as const;
const WIPE = 12;

const tileStart = (index: number): number => T.first + T.stagger * index;

/** What the score needs from S6, in shot-local frames: a shimmer pluck per tile on the next chord tone, the click, the rush, the hit when the mix opens, the gold ignite. */
export const S6_CUES: ShotCue[] = [
  ...Array.from({ length: TILE_COUNT }, (_, i) => ({
    shot: "mixes",
    at: tileStart(i),
    kind: "pluck",
    label: `tile ${i + 1} develops, chord tone ${i + 1}`,
  })),
  { shot: "mixes", at: T.click, kind: "click", label: "open daily mix 1" },
  { shot: "mixes", at: T.rush, kind: "whoosh", label: "tile rushes forward" },
  { shot: "mixes", at: T.cut, kind: "hit", label: "mix page opens" },
  { shot: "mixes", at: T.cut + 2, kind: "ping", label: "cover ignites gold" },
  { shot: "mixes", at: T.cut + 48, kind: "tick", label: "saved to navidrome" },
];

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };
const ROW = { x: 220, y: 548, w: 1200, h: 230 };

const HOME_SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 765 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 1241, h: 765 }, z: 60 },
];

const lane = (index: number): { x: number; y: number; w: number; h: number } => {
  const box = tileBox(index);
  return { x: box.x - 50, y: box.y - 28, w: box.w + 100, h: box.h + 56 };
};

const HOME_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.04, rx: 5, ry: -3 },
  { at: grid(tileStart(0) + 4), box: lane(0), scale: 2, rx: 2, ry: 3 },
  { at: grid(tileStart(TILE_COUNT - 1) + 10), box: lane(TILE_COUNT - 1), scale: 2, rx: 1, ry: -3 },
  { at: grid(T.pullback + 18), box: ROW, scale: 1.45, rx: 0, ry: 1 },
]);

const CURSOR: CursorStop[] = [
  { at: grid(T.pullback - 4), x: 1330, y: 700 },
  { at: grid(T.click), x: 300, y: 664, click: true, dwell: 1 },
];

const COVER = { x: 220, y: 62, w: 152, h: 152 };
const SIDEBAR_ROW = { x: 8, y: 447, w: 183, h: 28 };

const MIX_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: COVER, scale: 3.4, rx: 0, ry: -2 },
  { at: grid(24), box: { x: 200, y: 50, w: 520, h: 170 }, scale: 2.1, rx: 0, ry: 2 },
  { at: grid(46), box: { x: 0, y: 380, w: 220, h: 220 }, scale: 2.1, rx: 0, ry: 4 },
  { at: grid(SHOT.frames - T.cut), box: { x: 0, y: 380, w: 220, h: 220 }, scale: 2.25, rx: 0, ry: 3 },
]);

const tileCentre = (index: number): { x: number; y: number } => {
  const box = tileBox(index);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
};

function HomeScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, HOME_KEYS), handheld(frame, 0.6));
  const index = Math.min(TILE_COUNT - 1, Math.max(0, (frame - T.first) / T.stagger));
  const here = tileCentre(Math.floor(index));
  const there = tileCentre(Math.ceil(index));
  const frac = index - Math.floor(index);
  const pool = {
    x: lerp(here.x, there.x, ease.inOut(frac)),
    y: here.y,
    radius: 460,
    dim: 0.55,
    wash: 0.06,
  };
  const rush = ramp(frame, T.rush, T.cut - 1 - T.rush, ease.in);
  const centreX = (STAGE.w / 2 + cam.x / cam.scale - LAYOUT.left) / LAYOUT.k;
  const centreY = (STAGE.h / 2 + cam.y / cam.scale - LAYOUT.top) / LAYOUT.k;
  const first = tileCentre(0);
  const grow = (COVER.w * 3.4) / (tileBox(0).w * cam.scale);
  const cursorOpacity = ramp(frame, T.pullback - 4, 8) * (1 - ramp(frame, T.rush, 6, ease.in));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("home-mixes/home")} layout={LAYOUT} slices={HOME_SLICES} focusZ={60} aperture={0.012} light={pool}>
        {Array.from({ length: TILE_COUNT }, (_, i) => (
          <TileVeil key={tileBox(i).x} box={tileBox(i)} develop={developOf(frame, tileStart(i), T.length)} />
        ))}
        {rush > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: `${first.x}px ${first.y}px`,
              transform: `translate(${(centreX - first.x) * rush}px, ${(centreY - first.y) * rush}px) scale(${lerp(1, grow, rush)})`,
            }}
          >
            <TileCrop index={0} />
          </div>
        ) : null}
        <div style={{ opacity: cursorOpacity }}>
          <Cursor stops={CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
        </div>
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={6} opacity={0.1} />
    </Camera>
  );
}

const MIX_SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 765 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 1241, h: 765 }, z: 60 },
];

function MixScene() {
  const frame = useCurrentFrame() - T.cut;
  const cam = addCam(camAt(frame, MIX_KEYS), handheld(frame, 0.5));
  const t = ramp(frame, 0, 20);
  const pool = {
    x: lerp(lerp(296, 440, ramp(frame, 14, 14)), 100, ramp(frame, 38, 12)),
    y: lerp(lerp(138, 130, ramp(frame, 14, 14)), 462, ramp(frame, 38, 12)),
    radius: 420,
    dim: 0.5,
    wash: 0.07,
  };
  const scale = COVER.w / tileBox(0).w;
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("home-mixes/mix")} layout={LAYOUT} slices={MIX_SLICES} focusZ={60} aperture={0.012} light={pool}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            filter: `drop-shadow(0 0 ${lerp(0, 36, t)}px color-mix(in oklch, var(--ignite) ${Math.round(70 * (1 - t * 0.4))}%, transparent))`,
          }}
        >
          <TileCrop index={0} scale={scale} at={{ x: COVER.x, y: COVER.y }}>
            <Ignite t={t} />
          </TileCrop>
        </div>
        <Bracket box={SIDEBAR_ROW} at={grid(T.cut + 46)} pad={5} arm={10} width={2} length={0.5} />
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={9} opacity={0.1} />
    </Camera>
  );
}

/** S6, the mixes: the made-for-you tiles open dot by dot, one beat apart, the cursor takes daily mix 1, the tile rushes at the camera and the mix page opens with that same tile as its cover, catching gold. It is saved to the server, in the sidebar like any playlist. */
export function MixesShot() {
  const frame = useCurrentFrame();
  return (
    <ShotTransit frames={SHOT.frames} leave={null}>
      {frame < T.cut ? <HomeScene /> : <MixScene />}
      <Chip text="saved to navidrome" from={T.cut + 40} x={96} y={960} />
      <DitherWipe from={0} length={WIPE} />
    </ShotTransit>
  );
}
