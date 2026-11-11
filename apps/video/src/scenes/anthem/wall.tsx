import type { CSSProperties } from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { plateSrc } from "../../captures/film-manifest";
import { ease, hash, lerp, ramp } from "../../design/motion";
import { GOLD } from "./kit";

const COLS = 12;
const ROWS = 9;
const TILE = 204;
const GAP = 14;
const PITCH = TILE + GAP;
const LEFT = (1920 - COLS * PITCH + GAP) / 2;
const TOP = (1080 - ROWS * PITCH + GAP) / 2;

/** Where the 24 whole covers sit on the real albums page, in plate px. */
const SOURCE = { x0: 220, y0: 146, pitchX: 151.5, pitchY: 196.5, size: 140, cols: 8, rows: 3 };
const PLATE = { w: 1440, h: 810 };
/** The playing album's cover at full size, from the lyrics page: the one gold tile, and what the next shot opens on. */
const GOLD_SOURCE = { x: 39, y: 48, size: 486 };
const GOLD_CELL = { col: 6, row: 3 };
const GOLD_INDEX = 1;

interface Cell {
  col: number;
  row: number;
  source: number;
  gold: boolean;
  far: number;
}

function cells(): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < ROWS; row += 1)
    for (let col = 0; col < COLS; col += 1) {
      const gold = col === GOLD_CELL.col && row === GOLD_CELL.row;
      let source = (row * 11 + col * 5 + row * col) % 24;
      if (source === GOLD_INDEX) source = (source + 7) % 24;
      out.push({ col, row, source, gold, far: Math.hypot(col - GOLD_CELL.col, row - GOLD_CELL.row) });
    }
  return out;
}

const CELLS = cells();
const _MAX_FAR = Math.max(...CELLS.map((cell) => cell.far));

function crop(cell: Cell, albums: string, lyrics: string): CSSProperties {
  if (cell.gold) {
    const k = TILE / GOLD_SOURCE.size;
    return {
      backgroundImage: `url(${lyrics})`,
      backgroundSize: `${PLATE.w * k}px ${PLATE.h * k}px`,
      backgroundPosition: `${-GOLD_SOURCE.x * k}px ${-GOLD_SOURCE.y * k}px`,
    };
  }
  const k = TILE / SOURCE.size;
  const sx = SOURCE.x0 + (cell.source % SOURCE.cols) * SOURCE.pitchX;
  const sy = SOURCE.y0 + Math.floor(cell.source / SOURCE.cols) * SOURCE.pitchY;
  return {
    backgroundImage: `url(${albums})`,
    backgroundSize: `${PLATE.w * k}px ${PLATE.h * k}px`,
    backgroundPosition: `${-sx * k}px ${-sy * k}px`,
  };
}

export interface WallTiming {
  burst: number;
  /** frames on which a ripple leaves the centre: one a beat while the camera flies over the wall */
  ripples: readonly number[];
  pick: number;
  dive: number;
  end: number;
}

/** Screen box the gold cover must fill on the last frame, so the cut to the lyrics page does not move it. */
export interface Landing {
  x: number;
  y: number;
  size: number;
}

/** The library as one object: every cover bursts out of a single gold point, locks into a wall, and the camera falls into the one that is playing. */
export function CoverWall({ timing, landing }: { timing: WallTiming; landing: Landing }) {
  const frame = useCurrentFrame();
  const albums = plateSrc("albums", "albums");
  const lyrics = plateSrc("lyrics-full", "word-04-0");
  const picked = ramp(frame, timing.pick, 14);
  const dive = ramp(frame, timing.dive, timing.end - timing.dive, ease.inOut);
  const fly = ramp(frame, timing.burst, timing.dive - timing.burst, (t) => t);
  const goldX = LEFT + GOLD_CELL.col * PITCH;
  const goldY = TOP + GOLD_CELL.row * PITCH;
  const scale = lerp(lerp(1.55, 1.3, fly), landing.size / TILE, dive);
  const originX = goldX + TILE / 2;
  const originY = goldY + TILE / 2;
  const shiftX = lerp(0, landing.x + landing.size / 2 - originX, dive);
  const shiftY = lerp(0, landing.y + landing.size / 2 - originY, dive);
  const dot = ramp(frame, 0, timing.burst, ease.in);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden", perspective: 1300, perspectiveOrigin: `${originX}px ${originY}px` }}>
      <Img src={albums} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <Img src={lyrics} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transformOrigin: `${originX}px ${originY}px`,
          transform: `translate(${shiftX}px, ${shiftY}px) scale(${scale}) rotateX(${lerp(56, 0, dive)}deg) rotateZ(${lerp(lerp(-10, 6, fly), 0, dive)}deg) translateY(${lerp(lerp(-330, 250, fly), 0, dive)}px)`,
        }}
      >
        {CELLS.map((cell) => {
          const delay = cell.far * 2.4;
          const out = ramp(frame, timing.burst + delay, 30);
          if (out <= 0) return null;
          const seed = cell.row * COLS + cell.col;
          const x = LEFT + cell.col * PITCH;
          const y = TOP + cell.row * PITCH;
          const fromZ = lerp(-2400, 900, hash(seed * 3.1));
          const spin = (hash(seed * 7.7) - 0.5) * 140;
          const wave = Math.max(0, ...timing.ripples.map((at) => 1 - Math.abs((frame - at) / 3 - cell.far) / 1.6));
          const dim = cell.gold ? 1 : lerp(1, 0.16, picked) * (1 - dive * 0.9);
          const lift = cell.gold ? 0 : wave * 70;
          return (
            <div
              key={seed}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: TILE,
                height: TILE,
                ...crop(cell, albums, lyrics),
                opacity: Math.min(1, out * 2.2) * dim,
                transform: `translate3d(${lerp(originX - x - TILE / 2, 0, out)}px, ${lerp(originY - y - TILE / 2, 0, out)}px, ${lerp(fromZ, 0, out) + lift}px) rotateY(${lerp(spin, 0, out)}deg) scale(${lerp(0.2, 1, out)})`,
                filter: cell.gold ? undefined : `grayscale(1) brightness(${1 + wave * 0.9})`,
                boxShadow: cell.gold
                  ? `0 0 ${lerp(0, 90, picked)}px color-mix(in oklch, ${GOLD} ${Math.round(70 * picked)}%, transparent)`
                  : undefined,
              }}
            />
          );
        })}
      </div>
      {frame < timing.burst + 10 ? (
        <div
          style={{
            position: "absolute",
            left: originX - 9,
            top: originY - 9,
            width: 18,
            height: 18,
            background: GOLD,
            transform: `scale(${lerp(0.2, 1.6, dot) * (1 - ramp(frame, timing.burst, 10))})`,
            boxShadow: `0 0 ${60 * dot}px ${GOLD}`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
}
