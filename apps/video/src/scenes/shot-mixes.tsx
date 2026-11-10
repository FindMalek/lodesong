import { useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, camAt, handheld, STAGE } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { DitherWipe } from "../design/dither-wipe";
import { Bokeh } from "../design/dof";
import { Bracket } from "../design/draw";
import { ease, lerp, ramp } from "../design/motion";
import { Plate, type PlateSlice, plateKeys } from "../design/plate";
import { BRIGHT, Chip, grid, LAYOUT, LIFT, Patch, plateFile, ShotTransit } from "../ui/s4-kit";
import { developOf, Ignite, TILE_COUNT, TileCrop, TileVeil, tileBox } from "../ui/s6-tiles";
import { shotOf } from "./timelines";

const SHOT = shotOf("mixes");

const K = 2 / 3;
const s = (frames: number): number => Math.round(frames * K);

const T = {
  first: s(12),
  stagger: s(14),
  length: s(44),
  pullback: s(140),
  click: s(176),
  rush: s(178),
  cut: s(198),
  radio: s(252),
  radioPlay: s(276),
  folders: s(304),
} as const;
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
  { shot: "mixes", at: T.radio, kind: "hit", label: "radio station flash" },
  { shot: "mixes", at: T.radioPlay, kind: "click", label: "radio play, gold on the bar" },
  { shot: "mixes", at: T.folders, kind: "hit", label: "folder flash" },
  { shot: "mixes", at: T.folders + 3, kind: "pluck", label: "folder aura ignites" },
].sort((a, b) => a.at - b.at);

const WHOLE = { x: 0, y: 0, w: 1440, h: 810 };
const ROW = { x: 220, y: 548, w: 1200, h: 230 };

const HOME_SLICES: PlateSlice[] = [
  { name: "sidebar", box: { x: 0, y: 45, w: 199, h: 765 }, z: 25 },
  { name: "main", box: { x: 199, y: 45, w: 1241, h: 765 }, z: 60 },
];

const HOME_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: WHOLE, scale: 1.04, rx: 5, ry: -3 },
  { at: grid(tileStart(0) + 6), box: ROW, scale: 1.14, rx: 2, ry: 2 },
  { at: grid(tileStart(TILE_COUNT - 1) + 12), box: ROW, scale: 1.26, rx: 1, ry: -2 },
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
  { at: grid(s(26)), box: { x: 200, y: 50, w: 520, h: 170 }, scale: 2.1, rx: 0, ry: 2 },
  { at: grid(s(44)), box: { x: 0, y: 380, w: 220, h: 220 }, scale: 2.1, rx: 0, ry: 4 },
  { at: grid(T.radio - T.cut), box: { x: 0, y: 380, w: 220, h: 220 }, scale: 2.25, rx: 0, ry: 3 },
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
    dim: 0.85,
    wash: 0,
  };
  const rush = ramp(frame, T.rush, T.cut - 1 - T.rush, ease.in);
  const centreX = (STAGE.w / 2 + cam.x / cam.scale - LAYOUT.left) / LAYOUT.k;
  const centreY = (STAGE.h / 2 + cam.y / cam.scale - LAYOUT.top) / LAYOUT.k;
  const first = tileCentre(0);
  const grow = (COVER.w * 3.4) / (tileBox(0).w * cam.scale);
  const cursorOpacity = ramp(frame, T.pullback - 4, 8) * (1 - ramp(frame, T.rush, 6, ease.in));
  return (
    <Camera cam={cam}>
      <Plate
        src={plateFile("home-mixes/home")}
        layout={LAYOUT}
        slices={HOME_SLICES}
        focusZ={60}
        aperture={0.003}
        brightness={LIFT}
        light={pool}
      >
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
  const t = ramp(frame, 0, s(24));
  const scale = COVER.w / tileBox(0).w;
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("home-mixes/mix")} layout={LAYOUT} slices={MIX_SLICES} focusZ={60} aperture={0.003} brightness={LIFT}>
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
        <Bracket box={SIDEBAR_ROW} at={grid(T.cut + s(26))} pad={5} arm={10} width={2} length={0.5} />
      </Plate>
      <Bokeh focusZ={0} z={300} count={5} seed={9} opacity={0.1} />
    </Camera>
  );
}

const RADIO_KEYS = plateKeys(LAYOUT, [
  { at: grid(T.radio), box: { x: 220, y: 60, w: 520, h: 170 }, scale: 1.6, ry: 3 },
  { at: grid(T.radioPlay), box: { x: 220, y: 60, w: 520, h: 170 }, scale: 1.75, ry: 1 },
  { at: grid(T.radioPlay + 1), box: { x: 0, y: 690, w: 720, h: 120 }, scale: 2, ry: -2 },
  { at: grid(T.folders - 1), box: { x: 0, y: 690, w: 720, h: 120 }, scale: 2.15, ry: -1 },
]);

const RADIO_CURSOR: CursorStop[] = [
  { at: grid(T.radio), x: 780, y: 270 },
  { at: grid(T.radioPlay), x: 414, y: 199, click: true, dwell: 1 },
];

const RADIO_COVER = { x: 13.5, y: 757, w: 43, h: 43 };

function RadioScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, RADIO_KEYS), handheld(frame, 0.5));
  const playing = frame >= T.radioPlay;
  const t = ramp(frame, T.radioPlay, s(20));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile(playing ? "radio-tune/playing" : "radio-tune/preview")} layout={LAYOUT} focusZ={0} brightness={LIFT}>
        {playing ? (
          <div style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 ${lerp(0, 20, t)}px var(--ignite))` }}>
            <Patch src={plateFile("radio-tune/playing")} box={RADIO_COVER} filter={BRIGHT} style={{ isolation: "isolate" }}>
              <Ignite t={t} />
            </Patch>
          </div>
        ) : (
          <div style={{ opacity: 1 - ramp(frame, T.radioPlay, 1) }}>
            <Cursor stops={RADIO_CURSOR} size={38 / (LAYOUT.k * cam.scale)} />
          </div>
        )}
      </Plate>
      <Bokeh focusZ={0} z={300} count={4} seed={12} opacity={0.1} />
    </Camera>
  );
}

const AURA = { x: 220, y: 102, w: 160, h: 160 };
const FOLDER_ROW = { x: 8, y: 413, w: 183, h: 28 };

const FOLDER_KEYS = plateKeys(LAYOUT, [
  { at: grid(T.folders), box: { x: 200, y: 90, w: 520, h: 190 }, scale: 1.9, ry: 3 },
  { at: grid(SHOT.frames - 1), box: { x: 160, y: 90, w: 520, h: 190 }, scale: 2.1, ry: 0 },
]);

function FoldersScene() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, FOLDER_KEYS), handheld(frame, 0.5));
  const t = ramp(frame, T.folders + 2, s(20));
  return (
    <Camera cam={cam}>
      <Plate src={plateFile("folders-new/created")} layout={LAYOUT} focusZ={0} brightness={LIFT}>
        <div style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 ${lerp(0, 28, t)}px var(--ignite))` }}>
          <Patch src={plateFile("folders-new/created")} box={AURA} filter={BRIGHT} style={{ isolation: "isolate" }}>
            <Ignite t={t} />
          </Patch>
        </div>
        <Bracket box={FOLDER_ROW} at={grid(T.folders + 4)} pad={5} arm={10} width={2} length={0.4} />
      </Plate>
      <Bokeh focusZ={0} z={300} count={4} seed={14} opacity={0.1} />
    </Camera>
  );
}

/** S6, the mixes: the made-for-you tiles open dot by dot, one beat apart, the cursor takes daily mix 1, the tile rushes at the camera and the mix page opens with that same tile as its cover, catching gold. It sits in the sidebar like any playlist; then flashes of a radio station starting and a new folder's aura igniting. */
export function MixesShot() {
  const frame = useCurrentFrame();
  return (
    <ShotTransit frames={SHOT.frames} leave={null}>
      {frame < T.cut ? <HomeScene /> : frame < T.radio ? <MixScene /> : frame < T.folders ? <RadioScene /> : <FoldersScene />}
      <Chip text="radio" from={T.radio} out={T.folders - 6} x={1480} y={960} />
      <Chip text="folders" from={T.folders + 2} x={96} y={960} />
      <DitherWipe from={0} length={WIPE} />
    </ShotTransit>
  );
}
